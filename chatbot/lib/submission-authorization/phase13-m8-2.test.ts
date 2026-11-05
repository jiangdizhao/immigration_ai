/**
 * Phase 13 M8.2 - integrated offline acceptance (groups A-D).
 *
 * Four comprehensive scenario groups rather than dozens of disconnected micro-tests:
 *
 *   A. self-service authorization;
 *   B. managed-service authorization and M4 reuse;
 *   C. human handoff and external evidence;
 *   D. security, persistence and integration boundaries.
 *
 * Everything here is offline: a deterministic in-memory store that reproduces the
 * database invariants, M8.1 evidence supplied as data, and M4 readiness supplied as a
 * data result. No provider, no database, no browser, no network.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ManagedHandoffResult } from "@/lib/managed-handoff/policy";
import {
  SubmissionAuthorizationError,
  submissionAuthorizationEnabled,
} from "./contracts";
import {
  type AuthorizationTestHooks,
  type AuthorizationTestProject,
  type AuthorizationTestWorld,
  createAuthorizationTestWorld,
  createInMemorySubmissionAuthorizationStore,
} from "./in-memory-store";
import type { ExactPackageEvidence } from "./policy";
import {
  derivedSubmissionState,
  handoffTransitionAllowed,
  SUBMISSION_AUTHORIZATION_DISCLOSURES,
} from "./policy";
import type {
  ExactPackageState,
  ExternalVerifier,
  HandoffAuthorityDecision,
  HandoffAuthorityPort,
  HandoffAuthorityRequest,
} from "./ports";
import {
  unavailableExternalVerifier,
  unavailableHandoffAuthority,
} from "./ports";
import {
  createSubmissionAuthorizationService,
  type SubmissionAuthorizationService,
} from "./service";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT = "22222222-2222-4222-8222-222222222222";
const TARGET = "33333333-3333-4333-8333-333333333333";
const PACKAGE_V1 = "44444444-4444-4444-8444-444444444444";
const PACKAGE_V2 = "55555555-5555-4555-8555-555555555555";
const CUSTOMER = "66666666-6666-4666-8666-666666666666";
const OTHER_CUSTOMER = "77777777-7777-4777-8777-777777777777";
const STAFF = "88888888-8888-4888-8888-888888888888";
const UNAUTHORIZED_STAFF = "99999999-9999-4999-8999-999999999999";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

const TARGET_KIND = "student_500_visa_application" as const;

const SELF_DISCLOSURES =
  SUBMISSION_AUTHORIZATION_DISCLOSURES.self_service_external_submission as unknown as readonly string[];
const MANAGED_DISCLOSURES =
  SUBMISSION_AUTHORIZATION_DISCLOSURES.managed_service_professional_handoff as unknown as readonly string[];

/** One M8.1 package version with both confirmations current and finalized. */
function packageVersion(input: {
  readonly packageVersionId: string;
  readonly version: number;
  readonly manifestSha256: string;
  readonly targetVersion?: number;
  readonly integrityVerified?: boolean;
  readonly current?: boolean;
  readonly contentCurrent?: boolean;
  readonly contentFinalized?: boolean;
  readonly declarationsCurrent?: boolean;
}): ExactPackageEvidence {
  return {
    confirmations: [
      {
        confirmationId: `${input.packageVersionId}-content`,
        confirmationType: "package_content_review",
        current: input.contentCurrent ?? true,
        finalized: input.contentFinalized ?? true,
        invalidatedReasonCodes: [],
        manifestSha256: input.manifestSha256,
        packageVersion: input.version,
        packageVersionId: input.packageVersionId,
      },
      {
        confirmationId: `${input.packageVersionId}-declarations`,
        confirmationType: "customer_declarations",
        current: input.declarationsCurrent ?? true,
        finalized: true,
        invalidatedReasonCodes: [],
        manifestSha256: input.manifestSha256,
        packageVersion: input.version,
        packageVersionId: input.packageVersionId,
      },
    ],
    freshness: { current: input.current ?? true, reasonCodes: [] },
    integrityVerified: input.integrityVerified ?? true,
    manifestSha256: input.manifestSha256,
    packageVersionId: input.packageVersionId,
    targetVersion: input.targetVersion ?? 3,
    version: input.version,
  };
}

function readyResult(
  overrides: Partial<ManagedHandoffResult> = {}
): ManagedHandoffResult {
  return {
    actorUserId: CUSTOMER,
    checkedAt: new Date(0).toISOString(),
    checkedRevisions: {
      agreement: null,
      assignment: null,
      disclosure: null,
      engagement: 1,
      membership: null,
      payment: null,
      project: 1,
      review: 1,
      target: null,
    },
    engagementId: "e1",
    evidenceProvenance: "synthetic_test",
    evidenceRefs: [],
    paymentPredicate: "REQUIRED_SATISFIED",
    policyVersion: "phase13-m4-007-managed-handoff-v1",
    policyVersions: {
      handoff: "phase13-m4-007-managed-handoff-v1",
      payment: "phase13-m4-005-payment-v1",
      review: "phase13-m4-006-review-v1",
    },
    projectId: PROJECT,
    reasonCodes: [],
    revalidationToken: "token",
    status: "READY",
    target: {
      targetId: TARGET,
      targetKind: TARGET_KIND,
      targetSha256: SHA_A,
      targetVersion: 3,
    },
    ...overrides,
  };
}

/** A synthetic authority that is only ever injected by a test. */
function syntheticAuthority(
  decide: (
    request: HandoffAuthorityRequest
  ) => HandoffAuthorityDecision = () => ({
    authorityCode: "synthetic_test_handoff_authority",
    policyVersion: "synthetic-test-v1",
    provenance: "synthetic_test",
    status: "allowed",
  })
): HandoffAuthorityPort {
  return { code: "synthetic_test_handoff_authority", decide };
}

type Fixture = {
  readonly world: AuthorizationTestWorld;
  readonly service: SubmissionAuthorizationService;
  readonly hooks: AuthorizationTestHooks;
  readonly readinessCalls: () => number;
  setPackages(state: ExactPackageState | null): void;
  setReadiness(result: ManagedHandoffResult | "unavailable"): void;
};

/**
 * A fixture whose M8.1 evidence and M4 readiness are switchable, so a test can prove
 * that a change *between* two operations really invalidates the first one.
 */
function fixture(
  options: {
    readonly hooks?: AuthorizationTestHooks;
    readonly authority?: HandoffAuthorityPort;
    readonly readiness?: ManagedHandoffResult | "unavailable";
    readonly packages?: ExactPackageState | null;
    readonly withStaffAssignment?: boolean;
    readonly verifier?: ExternalVerifier;
  } = {}
): Fixture {
  const world = createAuthorizationTestWorld();
  world.accounts.set(CUSTOMER, { registeredCustomer: true, staff: false });
  world.accounts.set(OTHER_CUSTOMER, {
    registeredCustomer: true,
    staff: false,
  });
  world.accounts.set(STAFF, {
    registeredCustomer: false,
    staff: true,
    staffRole: "lawyer",
  });
  world.accounts.set(UNAUTHORIZED_STAFF, {
    registeredCustomer: false,
    staff: true,
    staffRole: "lawyer",
  });
  const project: AuthorizationTestProject = {
    assignments: new Map(),
    members: new Map(),
    ownerUserId: CUSTOMER,
    status: "active",
  };
  if (options.withStaffAssignment !== false) {
    project.assignments.set(STAFF, { id: "assignment-1", status: "active" });
  }
  world.projects.set(PROJECT, project);
  world.projects.set(OTHER_PROJECT, {
    assignments: new Map(),
    members: new Map(),
    ownerUserId: OTHER_CUSTOMER,
    status: "active",
  });

  let packages: ExactPackageState | null =
    options.packages === undefined
      ? {
          currentPackageVersionId: PACKAGE_V1,
          packages: [
            packageVersion({
              manifestSha256: SHA_A,
              packageVersionId: PACKAGE_V1,
              version: 1,
            }),
          ],
        }
      : options.packages;
  let readiness: ManagedHandoffResult | "unavailable" =
    options.readiness ?? readyResult();
  let readinessCalls = 0;
  const hooks = options.hooks ?? {};

  const service = createSubmissionAuthorizationService({
    externalVerifier: options.verifier ?? unavailableExternalVerifier,
    handoffAuthority: options.authority ?? syntheticAuthority(),
    readExactPackage: () => Promise.resolve(packages),
    readManagedReadiness: () => {
      readinessCalls += 1;
      return Promise.resolve(readiness);
    },
    store: createInMemorySubmissionAuthorizationStore(world, hooks),
  });

  return {
    hooks,
    readinessCalls: () => readinessCalls,
    service,
    setPackages(state: ExactPackageState | null) {
      packages = state;
    },
    setReadiness(result: ManagedHandoffResult | "unavailable") {
      readiness = result;
    },
    world,
  };
}

function scope(actorUserId: string = CUSTOMER) {
  return {
    actorUserId,
    projectId: PROJECT,
    targetId: TARGET,
    targetKind: TARGET_KIND,
  };
}

async function expectCode(
  run: () => Promise<unknown>,
  code: string
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof SubmissionAuthorizationError && error.code === code) {
      return;
    }
    throw error;
  }
  throw new Error(`expected ${code} but the call succeeded`);
}

describe("Group A - self-service authorization", () => {
  it("authorizes the exact current package with explicit disclosures", async () => {
    const f = fixture();
    const result = await f.service.authorizeSelfService({
      acknowledgedDisclosures: SELF_DISCLOSURES,
      actorUserId: CUSTOMER,
      operationId: "op-a1",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(result.replayed, false);
    assert.equal(
      result.authorization.authorizationType,
      "self_service_external_submission"
    );
    assert.equal(result.authorization.mode, "self_service");
    assert.equal(result.authorization.packageVersionId, PACKAGE_V1);
    assert.equal(result.authorization.manifestSha256, SHA_A);
    assert.equal(result.authorization.validity.status, "effective");
    assert.equal(result.authorization.bindingSha256.length, 64);
    // The stored acknowledgement is the canonical required set, not the caller's list.
    assert.deepEqual(
      [...result.authorization.acknowledgedDisclosures].sort(),
      [...SELF_DISCLOSURES].sort()
    );
  });

  it("refuses an authorization whose disclosures are incomplete", async () => {
    const f = fixture();
    await expectCode(
      () =>
        f.service.authorizeSelfService({
          acknowledgedDisclosures: SELF_DISCLOSURES.slice(0, 2),
          actorUserId: CUSTOMER,
          operationId: "op-a2",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "disclosure_not_acknowledged"
    );
    const view = await f.service.get(scope());
    assert.equal(view.authorization, null, "nothing was recorded");
  });

  it("binds to the exact version and rejects an unconfirmed package", async () => {
    const f = fixture();
    // Declarations present but not current: M8.1 does not consider this version
    // confirmed, so no authorization may be recorded from it.
    f.setPackages({
      currentPackageVersionId: PACKAGE_V1,
      packages: [
        packageVersion({
          declarationsCurrent: false,
          manifestSha256: SHA_A,
          packageVersionId: PACKAGE_V1,
          version: 1,
        }),
      ],
    });
    await expectCode(
      () =>
        f.service.authorizeSelfService({
          acknowledgedDisclosures: SELF_DISCLOSURES,
          actorUserId: CUSTOMER,
          operationId: "op-a3",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "confirmation_not_current"
    );
  });

  it("replays an identical operation and refuses a changed one under the same id", async () => {
    const f = fixture();
    const input = {
      acknowledgedDisclosures: SELF_DISCLOSURES,
      actorUserId: CUSTOMER,
      operationId: "op-a4",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    };
    const first = await f.service.authorizeSelfService(input);
    const replay = await f.service.authorizeSelfService(input);
    assert.equal(replay.replayed, true);
    assert.equal(
      replay.authorization.authorizationId,
      first.authorization.authorizationId
    );

    // Repeating the same authorization under a *new* operation id is still one
    // recorded decision, not a second one.
    const duplicate = await f.service.authorizeSelfService({
      ...input,
      operationId: "op-a4b",
    });
    assert.equal(duplicate.replayed, true);
    assert.equal(
      duplicate.authorization.authorizationId,
      first.authorization.authorizationId
    );

    // A changed *decision* under an existing operation id is a conflict, never a
    // silent overwrite: the same id cannot carry a self-service and a managed
    // authorization.
    await expectCode(
      () =>
        f.service.authorizeManagedService({
          acknowledgedDisclosures: MANAGED_DISCLOSURES,
          actorUserId: CUSTOMER,
          operationId: "op-a4",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "idempotency_conflict"
    );
  });

  it("refuses a superseded package version", async () => {
    const f = fixture({
      packages: {
        currentPackageVersionId: PACKAGE_V2,
        packages: [
          packageVersion({
            manifestSha256: SHA_A,
            packageVersionId: PACKAGE_V1,
            version: 1,
          }),
          packageVersion({
            manifestSha256: SHA_B,
            packageVersionId: PACKAGE_V2,
            version: 2,
          }),
        ],
      },
    });
    await expectCode(
      () =>
        f.service.authorizeSelfService({
          acknowledgedDisclosures: SELF_DISCLOSURES,
          actorUserId: CUSTOMER,
          operationId: "op-a5",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "package_not_current"
    );
  });

  it("refuses an integrity-failed package and an unreadable package state", async () => {
    const tampered = fixture({
      packages: {
        currentPackageVersionId: PACKAGE_V1,
        packages: [
          packageVersion({
            integrityVerified: false,
            manifestSha256: SHA_A,
            packageVersionId: PACKAGE_V1,
            version: 1,
          }),
        ],
      },
    });
    await expectCode(
      () =>
        tampered.service.authorizeSelfService({
          acknowledgedDisclosures: SELF_DISCLOSURES,
          actorUserId: CUSTOMER,
          operationId: "op-a6",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "package_integrity_unverified"
    );

    const unavailable = fixture({ packages: null });
    await expectCode(
      () =>
        unavailable.service.authorizeSelfService({
          acknowledgedDisclosures: SELF_DISCLOSURES,
          actorUserId: CUSTOMER,
          operationId: "op-a7",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "source_unavailable"
    );
    const view = await unavailable.service.get(scope());
    assert.equal(view.package.status, "unknown");
    assert.equal(view.nextAction, "unavailable");
  });

  it("records a customer-reported submission without claiming verification", async () => {
    const f = fixture();
    await f.service.authorizeSelfService({
      acknowledgedDisclosures: SELF_DISCLOSURES,
      actorUserId: CUSTOMER,
      operationId: "op-a8",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    let view = await f.service.get(scope());
    assert.equal(view.submissionState, "not_submitted");
    assert.equal(view.nextAction, "record_external_action");

    const recorded = await f.service.recordExternalRecord({
      actorUserId: CUSTOMER,
      channel: "government_portal",
      kind: "external_submission",
      occurredAt: "2026-11-05T00:00:00.000Z",
      operationId: "op-a8-ext",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      provenance: "customer_reported",
      reference: "REF-123",
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(recorded.record.verification, "unverified");
    assert.equal(recorded.record.provenance, "customer_reported");

    view = await f.service.get(scope());
    assert.equal(view.submissionState, "reported_unverified");
    assert.equal(view.externalRecords.length, 1);
    assert.equal(view.externalRecords[0]?.verification, "unverified");
  });

  it("derives submission state only from external records, never from an authorization", () => {
    // The pure function has no authorization input at all: a structural guarantee
    // rather than a runtime check somebody could forget.
    assert.equal(derivedSubmissionState([], PACKAGE_V1), "not_submitted");
    assert.equal(
      derivedSubmissionState(
        [
          {
            kind: "external_submission",
            packageVersionId: PACKAGE_V1,
            verification: "unverified",
          },
        ],
        PACKAGE_V1
      ),
      "reported_unverified"
    );
    assert.equal(
      derivedSubmissionState(
        [
          {
            kind: "external_submission",
            packageVersionId: PACKAGE_V1,
            verification: "verified",
          },
        ],
        PACKAGE_V1
      ),
      "verified"
    );
    // A record for a different package version is not evidence about this one.
    assert.equal(
      derivedSubmissionState(
        [
          {
            kind: "external_submission",
            packageVersionId: PACKAGE_V2,
            verification: "verified",
          },
        ],
        PACKAGE_V1
      ),
      "not_submitted"
    );
  });

  it("keeps the capability default-OFF and fails closed on an unknown value", () => {
    assert.equal(submissionAuthorizationEnabled(undefined), false);
    assert.equal(submissionAuthorizationEnabled(""), false);
    assert.equal(submissionAuthorizationEnabled("maybe"), false);
    assert.equal(submissionAuthorizationEnabled("true"), true);
  });
});

describe("Group B - managed-service authorization and M4 reuse", () => {
  it("fails closed when the M4 readiness result is unavailable", async () => {
    const f = fixture({ readiness: "unavailable" });
    await expectCode(
      () =>
        f.service.authorizeManagedService({
          acknowledgedDisclosures: MANAGED_DISCLOSURES,
          actorUserId: CUSTOMER,
          operationId: "op-b1",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "readiness_unknown"
    );
    const view = await f.service.get(scope());
    assert.equal(view.modes.managed_service.available, false);
    assert.equal(view.modes.managed_service.readinessStatus, "unavailable");
    assert.equal(view.modes.managed_service.evidenceProvenance, "unknown");
    // The self-service path is unaffected: the customer can still authorize
    // themselves while managed service is unavailable.
    assert.equal(view.modes.self_service.available, true);
  });

  it("maps each M4 blocker onto its own reason instead of a generic refusal", async () => {
    const cases: readonly [string, ManagedHandoffResult, string][] = [
      [
        "op-b2",
        readyResult({ reasonCodes: ["review_missing"], status: "NOT_READY" }),
        "professional_review_missing",
      ],
      [
        "op-b3",
        readyResult({
          reasonCodes: ["professional_credential_unverified"],
          status: "NOT_READY",
        }),
        "professional_credential_unverified",
      ],
      [
        "op-b4",
        readyResult({
          reasonCodes: ["review_authority_revoked"],
          status: "NOT_READY",
        }),
        "professional_authority_denied",
      ],
      ["op-b5", readyResult({ status: "UNKNOWN" }), "readiness_unknown"],
    ];
    for (const [operationId, readiness, code] of cases) {
      const f = fixture({ readiness });
      await expectCode(
        () =>
          f.service.authorizeManagedService({
            acknowledgedDisclosures: MANAGED_DISCLOSURES,
            actorUserId: CUSTOMER,
            operationId,
            packageVersionId: PACKAGE_V1,
            projectId: PROJECT,
            targetId: TARGET,
            targetKind: TARGET_KIND,
          }),
        code
      );
    }
  });

  it("does not accept the self-service disclosure set for a managed authorization", async () => {
    const f = fixture();
    await expectCode(
      () =>
        f.service.authorizeManagedService({
          acknowledgedDisclosures: SELF_DISCLOSURES,
          actorUserId: CUSTOMER,
          operationId: "op-b6",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "disclosure_not_acknowledged"
    );
  });

  it("runs the synthetic managed path and labels its evidence synthetic", async () => {
    const f = fixture();
    const authorized = await f.service.authorizeManagedService({
      acknowledgedDisclosures: MANAGED_DISCLOSURES,
      actorUserId: CUSTOMER,
      operationId: "op-b7",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(authorized.authorization.mode, "managed_service");
    assert.equal(authorized.authorization.validity.status, "effective");

    const requested = await f.service.requestHandoff({
      actorUserId: CUSTOMER,
      operationId: "op-b8",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      recipientUserId: STAFF,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(requested.handoff.status, "requested");
    assert.equal(requested.handoff.recipientUserId, STAFF);

    // Re-requesting the same package is a replay, not a second human action.
    const replay = await f.service.requestHandoff({
      actorUserId: CUSTOMER,
      operationId: "op-b8b",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.handoff.handoffId, requested.handoff.handoffId);

    const accepted = await f.service.transitionHandoff({
      action: "accept",
      actorUserId: STAFF,
      expectedRevision: 1,
      handoffId: requested.handoff.handoffId,
      operationId: "op-b9",
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(accepted.handoff.status, "accepted");
    assert.equal(accepted.handoff.revision, 2);

    const view = await f.service.get(scope());
    // The evidence that made this possible is synthetic and is reported as such.
    assert.equal(
      view.modes.managed_service.evidenceProvenance,
      "synthetic_test"
    );
    assert.equal(view.modes.managed_service.readinessStatus, "READY");
    assert.equal(view.handoffEligibility.status, "eligible");
    assert.equal(view.submissionState, "not_submitted");
    // An accepted handoff is still not a submission.
    assert.equal(view.nextAction, "await_professional_submission");
  });

  it("treats a self-service authorization as insufficient for a handoff", async () => {
    const f = fixture();
    await f.service.authorizeSelfService({
      acknowledgedDisclosures: SELF_DISCLOSURES,
      actorUserId: CUSTOMER,
      operationId: "op-b10",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    await expectCode(
      () =>
        f.service.requestHandoff({
          actorUserId: CUSTOMER,
          operationId: "op-b11",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "authorization_not_current"
    );
    const view = await f.service.get(scope());
    assert.equal(view.handoffEligibility.status, "not_eligible");
  });

  it("invalidates a managed authorization when the package changes after review", async () => {
    const f = fixture();
    await f.service.authorizeManagedService({
      acknowledgedDisclosures: MANAGED_DISCLOSURES,
      actorUserId: CUSTOMER,
      operationId: "op-b12",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    let view = await f.service.get(scope());
    assert.equal(view.authorization?.validity.status, "effective");

    // A new immutable version exists: the reviewed version is no longer current.
    f.setPackages({
      currentPackageVersionId: PACKAGE_V2,
      packages: [
        packageVersion({
          manifestSha256: SHA_A,
          packageVersionId: PACKAGE_V1,
          version: 1,
        }),
        packageVersion({
          manifestSha256: SHA_B,
          packageVersionId: PACKAGE_V2,
          version: 2,
        }),
      ],
    });
    view = await f.service.get(scope());
    assert.equal(view.authorization?.validity.status, "ineffective");
    assert.ok(
      view.authorization?.validity.reasonCodes.includes("package_not_current"),
      "the stale version is the stated reason"
    );
    assert.equal(view.handoffEligibility.status, "not_eligible");
    assert.equal(view.nextAction, "authorize_managed_service");

    // A handoff request against the old version is refused at the durable boundary.
    await expectCode(
      () =>
        f.service.requestHandoff({
          actorUserId: CUSTOMER,
          operationId: "op-b13",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "package_not_current"
    );
  });

  it("invalidates a managed authorization when the review no longer applies", async () => {
    const f = fixture();
    await f.service.authorizeManagedService({
      acknowledgedDisclosures: MANAGED_DISCLOSURES,
      actorUserId: CUSTOMER,
      operationId: "op-b14",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    f.setReadiness(
      readyResult({
        reasonCodes: ["review_target_changed"],
        status: "NOT_READY",
      })
    );
    const view = await f.service.get(scope());
    assert.equal(view.authorization?.validity.status, "ineffective");
    assert.ok(
      view.authorization?.validity.reasonCodes.includes(
        "professional_review_not_approved"
      )
    );
    assert.equal(view.modes.managed_service.available, false);
  });

  it("cannot accept a handoff under the production deny-all authority", async () => {
    const f = fixture({ authority: unavailableHandoffAuthority });
    await f.service.authorizeManagedService({
      acknowledgedDisclosures: MANAGED_DISCLOSURES,
      actorUserId: CUSTOMER,
      operationId: "op-b15",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    const requested = await f.service.requestHandoff({
      actorUserId: CUSTOMER,
      operationId: "op-b16",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    await expectCode(
      () =>
        f.service.transitionHandoff({
          action: "accept",
          actorUserId: STAFF,
          expectedRevision: 1,
          handoffId: requested.handoff.handoffId,
          operationId: "op-b17",
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "professional_authority_unavailable"
    );
    const view = await f.service.get(scope());
    assert.equal(
      view.handoff?.status,
      "requested",
      "the handoff stays unaccepted"
    );
  });
});

describe("Group C - human handoff and external evidence", () => {
  it("refuses acceptance by an unrelated or revoked staff member", async () => {
    const f = fixture();
    await f.service.authorizeManagedService({
      acknowledgedDisclosures: MANAGED_DISCLOSURES,
      actorUserId: CUSTOMER,
      operationId: "op-c1",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    const requested = await f.service.requestHandoff({
      actorUserId: CUSTOMER,
      operationId: "op-c2",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      recipientUserId: STAFF,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });

    // A staff account with no assignment on this Project cannot take the handoff.
    await expectCode(
      () =>
        f.service.transitionHandoff({
          action: "accept",
          actorUserId: UNAUTHORIZED_STAFF,
          expectedRevision: 1,
          handoffId: requested.handoff.handoffId,
          operationId: "op-c3",
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "handoff_actor_not_authorized"
    );

    // The customer cannot accept on the professional's behalf.
    await expectCode(
      () =>
        f.service.transitionHandoff({
          action: "accept",
          actorUserId: CUSTOMER,
          expectedRevision: 1,
          handoffId: requested.handoff.handoffId,
          operationId: "op-c4",
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "actor_not_staff"
    );

    // A revoked assignment ends the ability to accept, even for the right person.
    const project = f.world.projects.get(PROJECT);
    assert.ok(project);
    project.assignments.set(STAFF, { id: "assignment-1", status: "revoked" });
    await expectCode(
      () =>
        f.service.transitionHandoff({
          action: "accept",
          actorUserId: STAFF,
          expectedRevision: 1,
          handoffId: requested.handoff.handoffId,
          operationId: "op-c5",
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "handoff_actor_not_authorized"
    );
  });

  it("is a compare-and-set and never replays a stale decision", async () => {
    const f = fixture();
    await f.service.authorizeManagedService({
      acknowledgedDisclosures: MANAGED_DISCLOSURES,
      actorUserId: CUSTOMER,
      operationId: "op-c6",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    const requested = await f.service.requestHandoff({
      actorUserId: CUSTOMER,
      operationId: "op-c7",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    const declined = await f.service.transitionHandoff({
      action: "decline",
      actorUserId: STAFF,
      expectedRevision: 1,
      handoffId: requested.handoff.handoffId,
      operationId: "op-c8",
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(declined.handoff.status, "declined");

    // The same decision again is a replay, not a second human action.
    const replay = await f.service.transitionHandoff({
      action: "decline",
      actorUserId: STAFF,
      expectedRevision: 1,
      handoffId: requested.handoff.handoffId,
      operationId: "op-c8",
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.handoff.revision, 2);

    // A stale acceptance loses the race.
    await expectCode(
      () =>
        f.service.transitionHandoff({
          action: "accept",
          actorUserId: STAFF,
          expectedRevision: 1,
          handoffId: requested.handoff.handoffId,
          operationId: "op-c9",
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "revision_conflict"
    );

    // Terminal states never move again.
    assert.equal(handoffTransitionAllowed("declined", "accepted"), false);
    assert.equal(handoffTransitionAllowed("accepted", "requested"), false);
    assert.equal(handoffTransitionAllowed("requested", "accepted"), true);
  });

  it("lets the customer cancel and keeps the audit trail", async () => {
    const f = fixture();
    await f.service.authorizeManagedService({
      acknowledgedDisclosures: MANAGED_DISCLOSURES,
      actorUserId: CUSTOMER,
      operationId: "op-c10",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    const requested = await f.service.requestHandoff({
      actorUserId: CUSTOMER,
      operationId: "op-c11",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    const cancelled = await f.service.transitionHandoff({
      action: "cancel",
      actorUserId: CUSTOMER,
      expectedRevision: 1,
      handoffId: requested.handoff.handoffId,
      operationId: "op-c12",
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(cancelled.handoff.status, "cancelled");
    assert.deepEqual(
      cancelled.handoff.history.map((entry) => entry.status),
      ["requested", "cancelled"],
      "every transition is retained"
    );
  });
});

describe("Group C2 - external evidence provenance", () => {
  async function managedWithAcceptedHandoff() {
    const f = fixture();
    await f.service.authorizeManagedService({
      acknowledgedDisclosures: MANAGED_DISCLOSURES,
      actorUserId: CUSTOMER,
      operationId: "op-c13",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    const requested = await f.service.requestHandoff({
      actorUserId: CUSTOMER,
      operationId: "op-c14",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      recipientUserId: STAFF,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    await f.service.transitionHandoff({
      action: "accept",
      actorUserId: STAFF,
      expectedRevision: 1,
      handoffId: requested.handoff.handoffId,
      operationId: "op-c15",
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    return { f, handoffId: requested.handoff.handoffId };
  }

  it("refuses a provenance the actor cannot legitimately claim", async () => {
    const { f, handoffId } = await managedWithAcceptedHandoff();
    // A customer cannot label their own report as staff attestation.
    await expectCode(
      () =>
        f.service.recordExternalRecord({
          actorUserId: CUSTOMER,
          channel: "school_portal",
          kind: "external_submission",
          operationId: "op-c16",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          provenance: "staff_attested",
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "evidence_provenance_invalid"
    );
    // A staff member cannot relabel an internal note as the customer's own report.
    await expectCode(
      () =>
        f.service.recordExternalRecord({
          actorUserId: STAFF,
          channel: "school_portal",
          handoffId,
          kind: "external_submission",
          operationId: "op-c17",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          provenance: "customer_reported",
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "evidence_provenance_invalid"
    );
  });

  it("cannot fabricate a verified receipt because no verifier exists", async () => {
    const { f, handoffId } = await managedWithAcceptedHandoff();
    await expectCode(
      () =>
        f.service.recordExternalRecord({
          actorUserId: STAFF,
          handoffId,
          kind: "external_outcome",
          occurredAt: "2026-11-05T00:00:00.000Z",
          operationId: "op-c18",
          outcomeCode: "receipt_received",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          provenance: "provider_verified",
          reference: "IMMI-RECEIPT-1",
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "evidence_verifier_unavailable"
    );
    const view = await f.service.get(scope());
    assert.equal(view.externalRecords.length, 0, "nothing was recorded");
    assert.equal(view.submissionState, "not_submitted");
  });

  it("records staff attestation as unverified and keeps it distinct from a submission", async () => {
    const { f, handoffId } = await managedWithAcceptedHandoff();
    const outcome = await f.service.recordExternalRecord({
      actorUserId: STAFF,
      handoffId,
      kind: "external_outcome",
      occurredAt: "2026-11-05T00:00:00.000Z",
      operationId: "op-c19",
      outcomeCode: "receipt_received",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      provenance: "staff_attested",
      reference: "IMMI-RECEIPT-1",
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(outcome.record.verification, "unverified");
    assert.equal(outcome.record.provenance, "staff_attested");

    // An outcome record alone never claims the submission itself happened.
    let view = await f.service.get(scope());
    assert.equal(view.submissionState, "not_submitted");

    const submission = await f.service.recordExternalRecord({
      actorUserId: STAFF,
      channel: "government_portal",
      handoffId,
      kind: "external_submission",
      occurredAt: "2026-11-05T00:00:00.000Z",
      operationId: "op-c20",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      provenance: "document_backed_unverified",
      reference: "upload-batch-77",
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(submission.record.verification, "unverified");

    view = await f.service.get(scope());
    assert.equal(view.submissionState, "reported_unverified");
    assert.equal(view.externalRecords.length, 2);
  });

  it("requires an accepted handoff before staff evidence is recorded", async () => {
    const f = fixture();
    await f.service.authorizeManagedService({
      acknowledgedDisclosures: MANAGED_DISCLOSURES,
      actorUserId: CUSTOMER,
      operationId: "op-c21",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    const requested = await f.service.requestHandoff({
      actorUserId: CUSTOMER,
      operationId: "op-c22",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    await expectCode(
      () =>
        f.service.recordExternalRecord({
          actorUserId: STAFF,
          handoffId: requested.handoff.handoffId,
          kind: "external_submission",
          operationId: "op-c23",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          provenance: "staff_attested",
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "handoff_state_conflict"
    );
    // And staff evidence always names a handoff.
    await expectCode(
      () =>
        f.service.recordExternalRecord({
          actorUserId: STAFF,
          kind: "external_submission",
          operationId: "op-c24",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          provenance: "staff_attested",
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "handoff_not_found"
    );
  });

  it("accepts a verified record only from an actual trusted verifier", async () => {
    const f = fixture({
      verifier: {
        code: "synthetic_test_verifier",
        verify: () => ({
          status: "verified",
          verifierCode: "synthetic_test_verifier",
        }),
      },
    });
    await f.service.authorizeManagedService({
      acknowledgedDisclosures: MANAGED_DISCLOSURES,
      actorUserId: CUSTOMER,
      operationId: "op-c25",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    const requested = await f.service.requestHandoff({
      actorUserId: CUSTOMER,
      operationId: "op-c25b",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      recipientUserId: STAFF,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    await f.service.transitionHandoff({
      action: "accept",
      actorUserId: STAFF,
      expectedRevision: 1,
      handoffId: requested.handoff.handoffId,
      operationId: "op-c25c",
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    // A customer can never assert a provider verdict about their own submission.
    await expectCode(
      () =>
        f.service.recordExternalRecord({
          actorUserId: CUSTOMER,
          channel: "government_portal",
          kind: "external_submission",
          operationId: "op-c26b",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          provenance: "provider_verified",
          reference: "IMMI-ACK-1",
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "evidence_provenance_invalid"
    );
    const verified = await f.service.recordExternalRecord({
      actorUserId: STAFF,
      channel: "government_portal",
      handoffId: requested.handoff.handoffId,
      kind: "external_submission",
      operationId: "op-c26",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      provenance: "provider_verified",
      reference: "IMMI-ACK-1",
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(verified.record.verification, "verified");
    const view = await f.service.get(scope());
    assert.equal(view.submissionState, "verified");
    // Even a verified submission record says nothing about the outcome.
    assert.equal(view.externalRecords.length, 1);
  });
});

describe("Group D - security, persistence and integration boundaries", () => {
  it("isolates Projects and refuses an ineligible actor", async () => {
    const f = fixture();
    await f.service.authorizeSelfService({
      acknowledgedDisclosures: SELF_DISCLOSURES,
      actorUserId: CUSTOMER,
      operationId: "op-d1",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });

    // A member of another Project is reported exactly like a foreign Project.
    await expectCode(
      () => f.service.get(scope(OTHER_CUSTOMER)),
      "project_forbidden"
    );
    await expectCode(
      () =>
        f.service.authorizeSelfService({
          acknowledgedDisclosures: SELF_DISCLOSURES,
          actorUserId: OTHER_CUSTOMER,
          operationId: "op-d2",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "project_forbidden"
    );

    // Staff participation alone never grants private application access.
    await expectCode(() => f.service.get(scope(STAFF)), "actor_not_eligible");

    // A guest-style account that is not registered as a customer is refused too.
    f.world.accounts.set(UNAUTHORIZED_STAFF, {
      registeredCustomer: false,
      staff: false,
    });
    await expectCode(
      () => f.service.get(scope(UNAUTHORIZED_STAFF)),
      "actor_not_eligible"
    );

    // The owning customer still sees only their own history.
    const own = await f.service.get(scope());
    assert.equal(own.authorizations.length, 1);
  });

  it("refuses an authorization once membership is revoked", async () => {
    const f = fixture();
    const project = f.world.projects.get(PROJECT);
    assert.ok(project);
    project.members.set(OTHER_CUSTOMER, "revoked");
    await expectCode(
      () => f.service.get(scope(OTHER_CUSTOMER)),
      "project_forbidden"
    );
    project.status = "closed";
    await expectCode(
      () =>
        f.service.authorizeSelfService({
          acknowledgedDisclosures: SELF_DISCLOSURES,
          actorUserId: CUSTOMER,
          operationId: "op-d3",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "project_closed"
    );
  });

  it("takes confirmation validity from M8.1 and never from row existence", async () => {
    const unfinalized = fixture({
      packages: {
        currentPackageVersionId: PACKAGE_V1,
        packages: [
          packageVersion({
            contentFinalized: false,
            contentCurrent: false,
            manifestSha256: SHA_A,
            packageVersionId: PACKAGE_V1,
            version: 1,
          }),
        ],
      },
    });
    await expectCode(
      () =>
        unfinalized.service.authorizeSelfService({
          acknowledgedDisclosures: SELF_DISCLOSURES,
          actorUserId: CUSTOMER,
          operationId: "op-d4",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "confirmation_not_finalized"
    );

    const stale = fixture({
      packages: {
        currentPackageVersionId: PACKAGE_V1,
        packages: [
          {
            ...packageVersion({
              manifestSha256: SHA_A,
              packageVersionId: PACKAGE_V1,
              version: 1,
            }),
            freshness: {
              current: false,
              reasonCodes: ["application_revision_changed"],
            },
          },
        ],
      },
    });
    await expectCode(
      () =>
        stale.service.authorizeSelfService({
          acknowledgedDisclosures: SELF_DISCLOSURES,
          actorUserId: CUSTOMER,
          operationId: "op-d5",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "package_not_current"
    );

    const missing = fixture({
      packages: {
        currentPackageVersionId: PACKAGE_V1,
        packages: [
          {
            ...packageVersion({
              manifestSha256: SHA_A,
              packageVersionId: PACKAGE_V1,
              version: 1,
            }),
            confirmations: [],
          },
        ],
      },
    });
    await expectCode(
      () =>
        missing.service.authorizeSelfService({
          acknowledgedDisclosures: SELF_DISCLOSURES,
          actorUserId: CUSTOMER,
          operationId: "op-d6",
          packageVersionId: PACKAGE_V1,
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "confirmation_missing"
    );
  });

  it("keeps exactly one record when two identical authorizations race", async () => {
    const f = fixture();
    const input = {
      acknowledgedDisclosures: SELF_DISCLOSURES,
      actorUserId: CUSTOMER,
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    };
    const [left, right] = await Promise.all([
      f.service.authorizeSelfService({ ...input, operationId: "op-d7" }),
      f.service.authorizeSelfService({ ...input, operationId: "op-d8" }),
    ]);
    assert.equal(
      left.authorization.authorizationId,
      right.authorization.authorizationId,
      "a double click cannot create two decisions"
    );
    const view = await f.service.get(scope());
    assert.equal(view.authorizations.length, 1);
  });

  it("never reports success when a dependency changes during the write", async () => {
    // The readiness result is re-read after the row is written, so a dependency that
    // changes mid-write can only make the answer worse, never better.
    let readiness: ManagedHandoffResult = readyResult();
    const world = createAuthorizationTestWorld();
    world.accounts.set(CUSTOMER, { registeredCustomer: true, staff: false });
    world.projects.set(PROJECT, {
      assignments: new Map(),
      members: new Map(),
      ownerUserId: CUSTOMER,
      status: "active",
    });
    const service = createSubmissionAuthorizationService({
      externalVerifier: unavailableExternalVerifier,
      handoffAuthority: syntheticAuthority(),
      readExactPackage: async () => ({
        currentPackageVersionId: PACKAGE_V1,
        packages: [
          packageVersion({
            manifestSha256: SHA_A,
            packageVersionId: PACKAGE_V1,
            version: 1,
          }),
        ],
      }),
      readManagedReadiness: async () => readiness,
      store: createInMemorySubmissionAuthorizationStore(world, {
        onBeforeAuthorizationInsert() {
          // The engagement is superseded between the preliminary check and the insert.
          readiness = readyResult({
            reasonCodes: ["engagement_superseded"],
            status: "NOT_READY",
          });
        },
      }),
    });
    const result = await service.authorizeManagedService({
      acknowledgedDisclosures: MANAGED_DISCLOSURES,
      actorUserId: CUSTOMER,
      operationId: "op-d9",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(
      result.authorization.validity.status,
      "ineffective",
      "the response reflects the state after the write"
    );
    const view = await service.get(scope());
    assert.equal(view.authorization?.validity.status, "ineffective");
    assert.equal(view.handoffEligibility.status, "not_eligible");
  });

  it("refuses to accept a handoff whose package changed after the request", async () => {
    const f = fixture();
    await f.service.authorizeManagedService({
      acknowledgedDisclosures: MANAGED_DISCLOSURES,
      actorUserId: CUSTOMER,
      operationId: "op-d10",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    const requested = await f.service.requestHandoff({
      actorUserId: CUSTOMER,
      operationId: "op-d11",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      recipientUserId: STAFF,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    f.setPackages({
      currentPackageVersionId: PACKAGE_V2,
      packages: [
        packageVersion({
          manifestSha256: SHA_A,
          packageVersionId: PACKAGE_V1,
          version: 1,
        }),
        packageVersion({
          manifestSha256: SHA_B,
          packageVersionId: PACKAGE_V2,
          version: 2,
        }),
      ],
    });
    await expectCode(
      () =>
        f.service.transitionHandoff({
          action: "accept",
          actorUserId: STAFF,
          expectedRevision: 1,
          handoffId: requested.handoff.handoffId,
          operationId: "op-d12",
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "handoff_not_current"
    );
    const view = await f.service.get(scope());
    assert.equal(view.handoff?.status, "requested");
    assert.equal(view.submissionState, "not_submitted");
  });

  it("keeps an append-only history that a later decision cannot rewrite", async () => {
    const f = fixture();
    const first = await f.service.authorizeSelfService({
      acknowledgedDisclosures: SELF_DISCLOSURES,
      actorUserId: CUSTOMER,
      operationId: "op-d13",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    const second = await f.service.authorizeManagedService({
      acknowledgedDisclosures: MANAGED_DISCLOSURES,
      actorUserId: CUSTOMER,
      operationId: "op-d14",
      packageVersionId: PACKAGE_V1,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    const view = await f.service.get(scope());
    assert.equal(view.authorizations.length, 2);
    const selfEntry = view.authorizations.find(
      (entry) => entry.authorizationId === first.authorization.authorizationId
    );
    assert.ok(selfEntry, "the earlier decision is still listed");
    // Its recorded identity is byte-for-byte what was written.
    assert.equal(selfEntry?.bindingSha256, first.authorization.bindingSha256);
    assert.equal(selfEntry?.authorizedAt, first.authorization.authorizedAt);
    assert.notEqual(
      second.authorization.authorizationId,
      first.authorization.authorizationId
    );
    // The newest effective managed decision is the one the customer sees.
    assert.equal(view.authorization?.mode, "managed_service");
  });
});
