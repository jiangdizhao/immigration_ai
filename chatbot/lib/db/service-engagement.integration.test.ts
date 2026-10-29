// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertions are scoped to this guarded database suite.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
  expectedM4_004_Migration,
  type M4_004_MigrationJournal,
  M4_004_TEST_APPROVAL,
  M4_004_TEST_TARGET,
  parseM4_004_DatabaseUrl,
  parseM4_004_MigrationJournal,
} from "../../scripts/phase13-m4-004-db-test-guard";
import { ProjectStaffAssignmentError } from "../project-staff-assignments/errors";
import { ServiceEngagementError } from "../service-engagement/errors";
import {
  hashServiceResourceObservation,
  parseServiceAgreementTerms,
  SERVICE_AGREEMENT_TERMS_SCHEMA_VERSION,
  SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION,
} from "../service-engagement/policy";
import { createSyntheticProjectResourceRevalidator } from "../service-engagement/synthetic-authorities";
import { createProjectFoundationRepository } from "./project-foundation";
import { createProjectStaffAssignmentRepository } from "./project-staff-assignment-repository";
import { closeLazyDatabase } from "./runtime-client";
import { createServiceEngagementRepository } from "./service-engagement-repository";

/**
 * GUARDED M4-004 PostgreSQL integration suite (R2-05).
 *
 * This file is excluded from `test:unit` and only runs through
 * `scripts/phase13-m4-004-db-test.ts`, which performs the full fail-closed
 * preflight (approval token, exact isolated URL, Docker identity, server identity,
 * Drizzle ledger tied to the pinned Migration 0043 bytes, child environment) before
 * the process starts. It has NOT been executed in this task: no database was
 * contacted, no container created and no migration applied.
 *
 * Every successful mutation below uses the real production contract:
 *   - operation request hashes come from `hashServiceEngagementOperationRequest`,
 *   - operator authority bindings come from the repository's own
 *     `loadServiceOperatorContext` / `loadSignatureVerificationTarget` read paths,
 *   - resource grants are bound to a real observation hash and an explicit
 *     in-transaction revalidator (test double only).
 * No authorization is bypassed.
 *
 * Remaining limitation (R1-05 boundary): the test double re-reads in-process. A
 * real adapter still has to prove a locked or serializable snapshot re-read
 * inside the same transaction; until then production keeps
 * `unsupportedProjectResourceDisclosureResolver` and no revalidator configured.
 */
const chatbotRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TEST_DATABASE_URL =
  process.env.PHASE13_M4_004_TEST_DATABASE_URL?.trim() ?? "";
const isGuardedRun =
  process.env.PHASE13_M4_004_TEST_RUNNER_VERIFIED === "1" &&
  process.env.PHASE13_M4_004_TEST_APPROVAL === M4_004_TEST_APPROVAL &&
  TEST_DATABASE_URL.length > 0;
const skipReason = isGuardedRun
  ? false
  : "M4-004 PostgreSQL integration requires its guarded launcher and separate owner approval";

function guardedTest(name: string, fn: () => Promise<void>): void {
  test(name, { skip: skipReason }, fn);
}

function operationKey(label: string) {
  return `m4-004-db-${label}-${randomUUID()}`;
}

function sha256(label: string) {
  return createHash("sha256").update(label).digest("hex");
}

function agreementVersionId() {
  return randomUUID();
}

function client() {
  parseM4_004_DatabaseUrl(TEST_DATABASE_URL);
  return postgres(TEST_DATABASE_URL, {
    connection: { TimeZone: "UTC" },
    idle_timeout: 20,
    max: 2,
  });
}

/**
 * Asserts that an operation fails with a specific `ServiceEngagementError` code.
 *
 * The repository validates some inputs **synchronously** (for example the FIX-03
 * canonical-terms gate and the UUID check in `runCreateAgreementVersion` run before
 * the transaction is opened), while most authorization and state checks reject the
 * returned promise. Stage 3B evidence: passing an eagerly-created promise let the
 * synchronous throw escape the assertion entirely, so the FIX-03 scenario aborted
 * at its first negative case.
 *
 * Accepting a lazy callback isolates the invocation inside the assertion boundary,
 * so a synchronous throw and an asynchronous rejection are both captured. Calls
 * that already pass a promise keep working unchanged.
 */
async function expectServiceError(
  operation: Promise<unknown> | (() => Promise<unknown>),
  code: ServiceEngagementError["code"]
) {
  await assert.rejects(
    async () => {
      const pending =
        typeof operation === "function" ? operation() : await operation;
      await pending;
    },
    (error: unknown) =>
      error instanceof ServiceEngagementError && error.code === code
  );
}

type PgErrorDetails = { code?: string; constraint?: string };

/**
 * Normalise a raw PostgreSQL error. `constraint_name` is the driver's mapping of
 * the protocol's constraint field; the message fallback keeps the constraint
 * identity available without depending on one driver surface.
 */
function pgErrorDetails(error: unknown): PgErrorDetails {
  const value = error as {
    code?: unknown;
    constraint_name?: unknown;
    message?: unknown;
  };
  const code = typeof value?.code === "string" ? value.code : undefined;
  const constraint =
    typeof value?.constraint_name === "string"
      ? value.constraint_name
      : typeof value?.message === "string"
        ? /constraint "([^"]+)"/u.exec(value.message)?.[1]
        : undefined;
  return { code, constraint };
}

type SyntheticResource = {
  projectId: string;
  resourceCategory: "project_document";
  resourceId: string;
  ownerUserId: string;
  version: number;
  fingerprint: string;
};

/** Exact `ProjectResourceSnapshot` for a synthetic resource (no extra fields). */
function resourceSnapshot(resource: SyntheticResource): {
  found: true;
  projectId: string;
  ownerUserId: string;
  version: number;
  category: "project_document";
  fingerprint: string;
} {
  return {
    category: resource.resourceCategory,
    fingerprint: resource.fingerprint,
    found: true,
    ownerUserId: resource.ownerUserId,
    projectId: resource.projectId,
    version: resource.version,
  };
}

/** Canonical observation hash for the exact snapshot that will be persisted. */
function resourceObservation(
  resource: SyntheticResource,
  adapterCode = "synthetic_test_resource_resolver"
) {
  return hashServiceResourceObservation({
    adapterCode,
    projectId: resource.projectId,
    resourceCategory: resource.resourceCategory,
    resourceFingerprint: resource.fingerprint,
    resourceId: resource.resourceId,
    resourceOwnerUserId: resource.ownerUserId,
    resourceVersion: resource.version,
  });
}

type Fixture = {
  adminUserId: string;
  ownerUserId: string;
  projectId: string;
  engagementId: string;
  lawyerUserId: string;
  assignmentId: string;
  projectRevision: number;
  resources: SyntheticResource[];
};

/** Repository composed exactly like production, plus a test-only revalidator. */
function repository(resources: readonly SyntheticResource[] = []) {
  return createServiceEngagementRepository({
    resourceRevalidator: createSyntheticProjectResourceRevalidator({
      resources: [...resources],
    }),
  });
}

async function seedUsers(sql: ReturnType<typeof client>) {
  const ownerUserId = randomUUID();
  const lawyerUserId = randomUUID();
  const adminUserId = randomUUID();
  const otherUserId = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  await sql`
    INSERT INTO "User" ("id", "email", "role", "emailVerifiedAt")
    VALUES (${ownerUserId}, ${`m4-004-${suffix}-owner@example.test`}, 'user', now()),
           (${lawyerUserId}, ${`m4-004-${suffix}-lawyer@example.test`}, 'lawyer', now()),
           (${adminUserId}, ${`m4-004-${suffix}-admin@example.test`}, 'admin', now()),
           (${otherUserId}, ${`m4-004-${suffix}-other@example.test`}, 'user', now())
  `;
  return { adminUserId, lawyerUserId, otherUserId, ownerUserId };
}

/**
 * Creates a synthetic Project, one accepted M4-002 staff assignment and an
 * engagement owned by the Project owner.
 *
 * FIX-01: the assignment is created through the *accepted* M4-002 Option A
 * workflow — an authenticated administrator proposes, the Project owner approves
 * and the named lawyer accepts. The owner is deliberately not the proposer: the
 * fixture must satisfy production authorization rather than the production
 * authorization being relaxed for the fixture. `seedFixture` also proves that a
 * non-admin proposal is refused before it builds anything else.
 *
 * Fixtures are synthetic and append-only (no teardown).
 */
async function seedFixture(
  label: string,
  options: { serviceMode?: "self_service" | "managed" } = {}
): Promise<Fixture> {
  const sql = client();
  try {
    const { adminUserId, lawyerUserId, ownerUserId } = await seedUsers(sql);
    const created = await createProjectFoundationRepository().createProject({
      actorUserId: ownerUserId,
      operationId: operationKey(`${label}-project`),
    });
    const projectId = created.project.id;
    const assignments = createProjectStaffAssignmentRepository();

    // The Project owner has no proposal authority; only an admin does.
    await assert.rejects(
      assignments.propose({
        actorUserId: ownerUserId,
        operationId: operationKey(`${label}-propose-owner`),
        projectId,
        staffUserId: lawyerUserId,
      }),
      (error: unknown) =>
        error instanceof ProjectStaffAssignmentError &&
        error.code === "not_found",
      "an owner-actor proposal must be refused"
    );
    const proposal = await assignments.propose({
      actorUserId: adminUserId,
      operationId: operationKey(`${label}-propose`),
      projectId,
      staffUserId: lawyerUserId,
    });
    assert.equal(proposal.replayed, false);

    const findAssignment = async () => {
      const rows = await assignments.listOwnerAssignments({
        actorUserId: ownerUserId,
        projectId,
      });
      const row = rows.find((entry) => entry.staffUserId === lawyerUserId);
      assert.ok(row, "assignment must be listed for the owner");
      return row;
    };
    const proposed = await findAssignment();
    assert.equal(proposed.proposalSha256.length, 64);
    assert.equal(proposed.noticeVersion.length > 0, true);
    await assignments.transition({
      action: "owner_approve",
      actorUserId: ownerUserId,
      assignmentId: proposed.assignmentId,
      expectedProjectRevision: proposed.expectedProjectRevision,
      noticeVersion: proposed.noticeVersion,
      operationId: operationKey(`${label}-approve`),
      projectId,
      proposalSha256: proposed.proposalSha256,
    });
    const approved = await findAssignment();
    await assignments.transition({
      action: "lawyer_accept",
      actorUserId: lawyerUserId,
      assignmentId: approved.assignmentId,
      expectedProjectRevision: approved.expectedProjectRevision,
      operationId: operationKey(`${label}-accept`),
      projectId,
    });
    const accepted = await findAssignment();
    assert.equal(accepted.assignmentStatus, "active");
    const engagement = await repository().createEngagement({
      actorUserId: ownerUserId,
      expectedProjectRevision: accepted.expectedProjectRevision,
      operationId: operationKey(`${label}-engagement`),
      projectId,
      requestHash: sha256(`${label}-engagement`),
      scopeCodes: ["school_admissions"],
      serviceMode: options.serviceMode ?? "managed",
    });
    assert.equal(engagement.replayed, false);
    return {
      adminUserId,
      assignmentId: accepted.assignmentId,
      engagementId: engagement.engagement.engagementId,
      lawyerUserId,
      ownerUserId,
      projectId,
      projectRevision: engagement.projectRevision,
      resources: [],
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * FIX-03: canonical agreement terms. Every agreement fixture goes through the
 * production `parseServiceAgreementTerms` contract, so the persisted payload is the
 * exact bytes the server produces and every authority request, draft, issue and
 * acceptance uses that payload's own SHA-256.
 */
function canonicalTerms(input: {
  serviceMode: "self_service" | "managed";
  scopeCodes: ("school_admissions" | "student_500_visa")[];
  title?: string;
}) {
  const parsed = parseServiceAgreementTerms({
    clauses: [
      {
        body: "Synthetic M4-004 integration clause; not legal advice and not an approved professional service term.",
        clauseId: "synthetic-scope",
        heading: "Synthetic service scope",
      },
    ],
    schemaVersion: SERVICE_AGREEMENT_TERMS_SCHEMA_VERSION,
    scopeCodes: input.scopeCodes,
    serviceMode: input.serviceMode,
    title: input.title ?? "Synthetic M4-004 integration agreement",
  });
  assert.ok(
    parsed,
    "canonical terms fixture must satisfy the production contract"
  );
  return parsed;
}

/**
 * Adds an active Project member through the supported foundation contract — the
 * owner invites (`membership_invite`, status `pending`) and the invited user
 * accepts (`membership_accept`, status `active`) — instead of writing
 * `ProjectMembership` directly. Returns the membership id and the Project revision
 * after both mutations so later grants use a revision that actually matches.
 */
async function seedActiveProjectMember(input: {
  projectId: string;
  ownerUserId: string;
  memberUserId: string;
  expectedRevision: number;
}) {
  const foundation = createProjectFoundationRepository();
  const invited = await foundation.inviteProjectMember({
    actorUserId: input.ownerUserId,
    expectedRevision: input.expectedRevision,
    operationId: operationKey("member-invite"),
    projectId: input.projectId,
    targetUserId: input.memberUserId,
  });
  assert.equal(invited.replayed, false);
  // `inviteProjectMember` returns early (without a revision bump) when the target
  // is not eligible or is already a member, so the exact revision proves that a
  // pending membership really was created for this fresh synthetic user.
  assert.equal(invited.project.revision, input.expectedRevision + 1);

  const sql = client();
  let membershipId: string | undefined;
  try {
    const [row] = await sql<{ id: string }[]>`
      SELECT "id" FROM "ProjectMembership"
      WHERE "projectId" = ${input.projectId} AND "userId" = ${input.memberUserId}
    `;
    membershipId = row?.id;
  } finally {
    await sql.end({ timeout: 5 });
  }
  assert.ok(membershipId, "invited membership must exist");

  const accepted = await foundation.acceptProjectMembership({
    actorUserId: input.memberUserId,
    expectedRevision: invited.project.revision,
    membershipId,
    operationId: operationKey("member-accept"),
    projectId: input.projectId,
  });
  assert.equal(accepted.replayed, false);
  assert.equal(accepted.project.revision, input.expectedRevision + 2);
  return { membershipId, projectRevision: accepted.project.revision };
}

guardedTest(
  "preflight matches the pinned Migration 0043 identity",
  async () => {
    const parsed = parseM4_004_DatabaseUrl(TEST_DATABASE_URL);
    const journal = parseM4_004_MigrationJournal(
      JSON.parse(
        readFileSync(
          resolve(chatbotRoot, "lib/db/migrations/meta/_journal.json"),
          "utf8"
        )
      ) as M4_004_MigrationJournal
    );
    const expected = expectedM4_004_Migration(
      journal,
      readFileSync(
        resolve(chatbotRoot, M4_004_TEST_TARGET.migrationSqlPath),
        "utf8"
      )
    );
    const sql = client();
    try {
      const [identity] = await sql<
        { db: string; role: string; version: string }[]
      >`
      SELECT current_database() AS db, current_user AS role, version() AS version
    `;
      assert.equal(identity?.db, parsed.database);
      assert.equal(identity?.role, parsed.role);
      assert.match(String(identity?.version), /^PostgreSQL 17\./u);
      const [ledger] = await sql<
        { rows: number; hash: string; createdAt: string | null }[]
      >`
      SELECT count(*)::int AS rows,
             (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1) AS hash,
             (SELECT created_at::text FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1) AS "createdAt"
      FROM drizzle.__drizzle_migrations
    `;
      assert.equal(ledger?.rows, M4_004_TEST_TARGET.migrationCount);
      assert.equal(ledger?.hash, expected.hash);
      // The applied migration time is the pinned journal `when` value.
      assert.equal(Number(ledger?.createdAt), expected.when);
    } finally {
      await closeLazyDatabase();
      await sql.end({ timeout: 5 });
    }
  }
);

guardedTest(
  "R2-03: an assigned lawyer cannot read Engagement detail",
  async () => {
    const fixture = await seedFixture("staff-detail");
    const engagements = repository();
    // The Project owner keeps full access.
    const ownerView = await engagements.getEngagement({
      actorUserId: fixture.ownerUserId,
      engagementId: fixture.engagementId,
      projectId: fixture.projectId,
    });
    assert.equal(ownerView.scope, "owner");
    // The accepted M4-002 assignment does not disclose Engagement existence/ids.
    await expectServiceError(
      engagements.getEngagement({
        actorUserId: fixture.lawyerUserId,
        engagementId: fixture.engagementId,
        projectId: fixture.projectId,
      }),
      "not_found"
    );
    // The owner-only list still returns the owner projection with full metadata.
    const list = await engagements.listEngagements({
      actorUserId: fixture.ownerUserId,
      limit: 10,
      projectId: fixture.projectId,
    });
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0]?.serviceMode, "managed");
    assert.deepEqual(list.items[0]?.scopeCodes, ["school_admissions"]);
  }
);

guardedTest(
  "R2-02: a draft is authorized for its exact id, and only that id",
  async () => {
    const fixture = await seedFixture("draft-binding");
    const engagements = repository();
    const terms = canonicalTerms({
      scopeCodes: ["school_admissions"],
      serviceMode: "managed",
    });
    const termsSha256 = terms.termsSha256;
    const draftId = agreementVersionId();
    const authority = await engagements.loadServiceOperatorContext({
      action: "author_draft",
      actorUserId: fixture.lawyerUserId,
      draft: {
        agreementVersionId: draftId,
        scopeCodes: ["school_admissions"],
        serviceMode: "managed",
        termsSha256,
      },
      engagementId: fixture.engagementId,
      projectId: fixture.projectId,
    });
    assert.equal(authority.operatorEligible, true);
    assert.equal(authority.operatorAuthority.action, "author_draft");
    assert.equal(authority.operatorAuthority.agreementVersionId, draftId);
    assert.equal(authority.operatorAuthority.agreementVersionStatus, "draft");

    // A different draft id yields a different canonical authority identity.
    const otherId = agreementVersionId();
    const otherAuthority = await engagements.loadServiceOperatorContext({
      action: "author_draft",
      actorUserId: fixture.lawyerUserId,
      draft: {
        agreementVersionId: otherId,
        scopeCodes: ["school_admissions"],
        serviceMode: "managed",
        termsSha256,
      },
      engagementId: fixture.engagementId,
      projectId: fixture.projectId,
    });
    assert.notEqual(
      otherAuthority.operatorAuthority.requestSha256,
      authority.operatorAuthority.requestSha256
    );

    // Approval for draft A cannot create draft B, even with identical terms.
    await expectServiceError(
      engagements.createAgreementVersion({
        actorUserId: fixture.lawyerUserId,
        agreementVersionId: otherId,
        authorityCode: "synthetic_test_contract_operator",
        authorityRequestSha256: authority.operatorAuthority.requestSha256,
        engagementId: fixture.engagementId,
        expectedProjectRevision: fixture.projectRevision,
        operationId: operationKey("draft-binding-mismatch"),
        projectId: fixture.projectId,
        requestHash: sha256("draft-binding-mismatch"),
        scopeCodes: ["school_admissions"],
        serviceMode: "managed",
        termsPayload: terms.payload,
        termsSha256,
      }),
      "integrity_conflict"
    );

    // The matching id is accepted.
    const created = await engagements.createAgreementVersion({
      actorUserId: fixture.lawyerUserId,
      agreementVersionId: draftId,
      authorityCode: "synthetic_test_contract_operator",
      authorityRequestSha256: authority.operatorAuthority.requestSha256,
      engagementId: fixture.engagementId,
      expectedProjectRevision: fixture.projectRevision,
      operationId: operationKey("draft-binding-ok"),
      projectId: fixture.projectId,
      requestHash: sha256("draft-binding-ok"),
      scopeCodes: ["school_admissions"],
      serviceMode: "managed",
      termsPayload: terms.payload,
      termsSha256,
    });
    assert.equal(created.replayed, false);
    assert.equal(created.agreementVersion.agreementVersionId, draftId);
    assert.equal(created.agreementVersion.status, "draft");
  }
);

guardedTest(
  "agreement scope mismatch and stale revision are rejected",
  async () => {
    const fixture = await seedFixture("agreement-scope");
    const engagements = repository();
    const terms = canonicalTerms({
      scopeCodes: ["student_500_visa"],
      serviceMode: "managed",
    });
    const termsSha256 = terms.termsSha256;
    const draftId = agreementVersionId();
    const authority = await engagements.loadServiceOperatorContext({
      action: "author_draft",
      actorUserId: fixture.lawyerUserId,
      draft: {
        agreementVersionId: draftId,
        scopeCodes: ["student_500_visa"],
        serviceMode: "managed",
        termsSha256,
      },
      engagementId: fixture.engagementId,
      projectId: fixture.projectId,
    });
    // The engagement is scoped to school_admissions, so a different scope fails
    // even with a valid authority binding and canonical terms for that scope.
    await expectServiceError(
      engagements.createAgreementVersion({
        actorUserId: fixture.lawyerUserId,
        agreementVersionId: draftId,
        authorityCode: "synthetic_test_contract_operator",
        authorityRequestSha256: authority.operatorAuthority.requestSha256,
        engagementId: fixture.engagementId,
        expectedProjectRevision: fixture.projectRevision,
        operationId: operationKey("agreement-scope-mismatch"),
        projectId: fixture.projectId,
        requestHash: sha256("agreement-scope-mismatch"),
        scopeCodes: ["student_500_visa"],
        serviceMode: "managed",
        termsPayload: terms.payload,
        termsSha256,
      }),
      "invalid_request"
    );
    // A stale revision is detected only for a request that is otherwise canonical.
    const engagementTerms = canonicalTerms({
      scopeCodes: ["school_admissions"],
      serviceMode: "managed",
    });
    const engagementAuthority = await engagements.loadServiceOperatorContext({
      action: "author_draft",
      actorUserId: fixture.lawyerUserId,
      draft: {
        agreementVersionId: draftId,
        scopeCodes: ["school_admissions"],
        serviceMode: "managed",
        termsSha256: engagementTerms.termsSha256,
      },
      engagementId: fixture.engagementId,
      projectId: fixture.projectId,
    });
    await expectServiceError(
      engagements.createAgreementVersion({
        actorUserId: fixture.lawyerUserId,
        agreementVersionId: draftId,
        authorityCode: "synthetic_test_contract_operator",
        authorityRequestSha256:
          engagementAuthority.operatorAuthority.requestSha256,
        engagementId: fixture.engagementId,
        expectedProjectRevision: fixture.projectRevision + 99,
        operationId: operationKey("agreement-stale-revision"),
        projectId: fixture.projectId,
        requestHash: sha256("agreement-stale-revision"),
        scopeCodes: ["school_admissions"],
        serviceMode: "managed",
        termsPayload: engagementTerms.payload,
        termsSha256: engagementTerms.termsSha256,
      }),
      "revision_conflict"
    );
  }
);

guardedTest(
  "managed activation requires issue, acceptance and verified evidence",
  async () => {
    const fixture = await seedFixture("managed-path");
    const engagements = repository();
    const terms = canonicalTerms({
      scopeCodes: ["school_admissions"],
      serviceMode: "managed",
    });
    const termsSha256 = terms.termsSha256;
    const draftId = agreementVersionId();

    const draftAuthority = await engagements.loadServiceOperatorContext({
      action: "author_draft",
      actorUserId: fixture.lawyerUserId,
      draft: {
        agreementVersionId: draftId,
        scopeCodes: ["school_admissions"],
        serviceMode: "managed",
        termsSha256,
      },
      engagementId: fixture.engagementId,
      projectId: fixture.projectId,
    });
    const draft = await engagements.createAgreementVersion({
      actorUserId: fixture.lawyerUserId,
      agreementVersionId: draftId,
      authorityCode: "synthetic_test_contract_operator",
      authorityRequestSha256: draftAuthority.operatorAuthority.requestSha256,
      engagementId: fixture.engagementId,
      expectedProjectRevision: fixture.projectRevision,
      operationId: operationKey("managed-draft"),
      projectId: fixture.projectId,
      requestHash: sha256("managed-draft"),
      scopeCodes: ["school_admissions"],
      serviceMode: "managed",
      termsPayload: terms.payload,
      termsSha256,
    });

    const issueAuthority = await engagements.loadServiceOperatorContext({
      action: "issue",
      actorUserId: fixture.lawyerUserId,
      agreementVersionId: draftId,
      engagementId: fixture.engagementId,
      projectId: fixture.projectId,
    });
    assert.equal(issueAuthority.operatorAuthority.termsSha256, termsSha256);
    assert.equal(issueAuthority.operatorAuthority.versionNumber, 1);
    const issued = await engagements.issueAgreementVersion({
      actorUserId: fixture.lawyerUserId,
      agreementVersionId: draftId,
      authorityCode: "synthetic_test_contract_operator",
      authorityRequestSha256: issueAuthority.operatorAuthority.requestSha256,
      engagementId: fixture.engagementId,
      expectedProjectRevision: draft.projectRevision,
      operationId: operationKey("managed-issue"),
      projectId: fixture.projectId,
      requestHash: sha256("managed-issue"),
    });
    assert.equal(issued.agreementVersion.status, "issued");

    // Activation before acceptance is refused.
    await expectServiceError(
      engagements.transitionEngagement({
        action: "activate",
        actorUserId: fixture.ownerUserId,
        engagementId: fixture.engagementId,
        expectedProjectRevision: issued.projectRevision,
        operationId: operationKey("managed-premature-activation"),
        projectId: fixture.projectId,
        requestHash: sha256("managed-premature-activation"),
      }),
      "state_conflict"
    );

    const accepted = await engagements.acceptAgreementVersion({
      actorUserId: fixture.ownerUserId,
      agreementVersionId: draftId,
      customerNoticeVersion: SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION,
      engagementId: fixture.engagementId,
      expectedProjectRevision: issued.projectRevision,
      operationId: operationKey("managed-accept"),
      projectId: fixture.projectId,
      requestHash: sha256("managed-accept"),
      termsSha256,
    });
    assert.equal(accepted.replayed, false);
  }
);

guardedTest(
  "signature timestamp skew boundary and verified managed activation",
  async () => {
    const fixture = await seedFixture("signature-path");
    const engagements = repository();
    const terms = canonicalTerms({
      scopeCodes: ["school_admissions"],
      serviceMode: "managed",
    });
    const termsSha256 = terms.termsSha256;
    const draftId = agreementVersionId();

    const draftAuthority = await engagements.loadServiceOperatorContext({
      action: "author_draft",
      actorUserId: fixture.lawyerUserId,
      draft: {
        agreementVersionId: draftId,
        scopeCodes: ["school_admissions"],
        serviceMode: "managed",
        termsSha256,
      },
      engagementId: fixture.engagementId,
      projectId: fixture.projectId,
    });
    const draft = await engagements.createAgreementVersion({
      actorUserId: fixture.lawyerUserId,
      agreementVersionId: draftId,
      authorityCode: "synthetic_test_contract_operator",
      authorityRequestSha256: draftAuthority.operatorAuthority.requestSha256,
      engagementId: fixture.engagementId,
      expectedProjectRevision: fixture.projectRevision,
      operationId: operationKey("signature-draft"),
      projectId: fixture.projectId,
      requestHash: sha256("signature-draft"),
      scopeCodes: ["school_admissions"],
      serviceMode: "managed",
      termsPayload: terms.payload,
      termsSha256,
    });
    const issueAuthority = await engagements.loadServiceOperatorContext({
      action: "issue",
      actorUserId: fixture.lawyerUserId,
      agreementVersionId: draftId,
      engagementId: fixture.engagementId,
      projectId: fixture.projectId,
    });
    const issued = await engagements.issueAgreementVersion({
      actorUserId: fixture.lawyerUserId,
      agreementVersionId: draftId,
      authorityCode: "synthetic_test_contract_operator",
      authorityRequestSha256: issueAuthority.operatorAuthority.requestSha256,
      engagementId: fixture.engagementId,
      expectedProjectRevision: draft.projectRevision,
      operationId: operationKey("signature-issue"),
      projectId: fixture.projectId,
      requestHash: sha256("signature-issue"),
    });
    const accepted = await engagements.acceptAgreementVersion({
      actorUserId: fixture.ownerUserId,
      agreementVersionId: draftId,
      customerNoticeVersion: SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION,
      engagementId: fixture.engagementId,
      expectedProjectRevision: issued.projectRevision,
      operationId: operationKey("signature-accept"),
      projectId: fixture.projectId,
      requestHash: sha256("signature-accept"),
      termsSha256,
    });

    // R2-06c boundary: just inside the shared 5-minute window is accepted.
    const now = Date.now();
    const submitted = await engagements.submitSignatureEvidence({
      actorUserId: fixture.ownerUserId,
      agreementVersionId: draftId,
      declaredSignedAt: new Date(now + 5 * 60 * 1000 - 2000),
      engagementId: fixture.engagementId,
      evidenceRef: "synthetic-envelope-1",
      evidenceSha256: sha256("signature-evidence-1"),
      expectedProjectRevision: accepted.projectRevision,
      operationId: operationKey("signature-submit"),
      projectId: fixture.projectId,
      requestHash: sha256("signature-submit"),
      termsSha256,
    });
    assert.equal(submitted.signatureEvidence.verificationStatus, "pending");

    // Beyond the window the request is rejected before any evidence exists.
    await expectServiceError(
      engagements.submitSignatureEvidence({
        actorUserId: fixture.ownerUserId,
        agreementVersionId: draftId,
        declaredSignedAt: new Date(now + 5 * 60 * 1000 + 60_000),
        engagementId: fixture.engagementId,
        evidenceRef: "synthetic-envelope-2",
        evidenceSha256: sha256("signature-evidence-2"),
        expectedProjectRevision: submitted.projectRevision,
        operationId: operationKey("signature-submit-skew"),
        projectId: fixture.projectId,
        requestHash: sha256("signature-submit-skew"),
        termsSha256,
      }),
      "invalid_request"
    );

    // Pending evidence cannot activate a managed service. Stage 3B evidence: the
    // repository's fail-closed branch for "no independently verified signature
    // evidence" is `authority_denied` (`assertActivationEligible`), while the
    // structural preconditions (no current version / not issued / no acceptance)
    // remain `state_conflict` — proven by the "managed activation requires …"
    // scenario. The authorization rule itself is unchanged; only this expectation
    // was wrong.
    await expectServiceError(
      () =>
        engagements.transitionEngagement({
          action: "activate",
          actorUserId: fixture.ownerUserId,
          engagementId: fixture.engagementId,
          expectedProjectRevision: submitted.projectRevision,
          operationId: operationKey("signature-unverified-activate"),
          projectId: fixture.projectId,
          requestHash: sha256("signature-unverified-activate"),
        }),
      "authority_denied"
    );

    const target = await engagements.loadSignatureVerificationTarget({
      actorUserId: fixture.lawyerUserId,
      engagementId: fixture.engagementId,
      evidenceId: submitted.signatureEvidence.evidenceId,
      projectId: fixture.projectId,
    });
    assert.equal(target.operatorAuthority.action, "verify_signature");
    assert.equal(
      target.operatorAuthority.evidenceVerificationStatus,
      "pending"
    );

    // A forged/rebound payload cannot borrow the approved verification.
    await expectServiceError(
      engagements.recordSignatureVerification({
        actorUserId: fixture.lawyerUserId,
        authorityRequestSha256: target.operatorAuthority.requestSha256,
        engagementId: fixture.engagementId,
        evidenceId: submitted.signatureEvidence.evidenceId,
        expectedProjectRevision: submitted.projectRevision,
        operationId: operationKey("signature-verify-mismatch"),
        outcome: {
          agreementVersionId: draftId,
          evidenceId: submitted.signatureEvidence.evidenceId,
          method: "manual_evidence_review",
          provenance: "synthetic_test_only_not_legally_attested",
          providerCode: "synthetic_test_verifier",
          signaturePayloadSha256: sha256("forged-payload"),
          status: "verified",
          verifiedAt: new Date().toISOString(),
        },
        projectId: fixture.projectId,
        requestHash: sha256("signature-verify-mismatch"),
      }),
      "integrity_conflict"
    );

    const verified = await engagements.recordSignatureVerification({
      actorUserId: fixture.lawyerUserId,
      authorityRequestSha256: target.operatorAuthority.requestSha256,
      engagementId: fixture.engagementId,
      evidenceId: submitted.signatureEvidence.evidenceId,
      expectedProjectRevision: submitted.projectRevision,
      operationId: operationKey("signature-verify"),
      outcome: {
        agreementVersionId: draftId,
        evidenceId: submitted.signatureEvidence.evidenceId,
        method: "manual_evidence_review",
        provenance: "synthetic_test_only_not_legally_attested",
        providerCode: "synthetic_test_verifier",
        signaturePayloadSha256: target.signaturePayloadSha256,
        status: "verified",
        verifiedAt: new Date().toISOString(),
      },
      projectId: fixture.projectId,
      requestHash: sha256("signature-verify"),
    });
    assert.equal(verified.signatureEvidence.verificationStatus, "verified");

    // The customer signatory is not an eligible *verification operator*: the
    // repository resolves M4-002 operator eligibility first and fails closed with
    // `not_found` (existence-hiding) before any "a signatory may not verify their
    // own evidence" defence-in-depth branch could be reached. Stage 3B R2 evidence:
    // this gate returns `not_found` from `runLoadSignatureVerificationTarget`
    // (`service-engagement-repository.ts:1875`). The authorization rule itself is
    // unchanged; only this expectation was wrong.
    await expectServiceError(
      engagements.loadSignatureVerificationTarget({
        actorUserId: fixture.ownerUserId,
        engagementId: fixture.engagementId,
        evidenceId: submitted.signatureEvidence.evidenceId,
        projectId: fixture.projectId,
      }),
      "not_found"
    );

    const activated = await engagements.transitionEngagement({
      action: "activate",
      actorUserId: fixture.ownerUserId,
      engagementId: fixture.engagementId,
      expectedProjectRevision: verified.projectRevision,
      operationId: operationKey("signature-activate"),
      projectId: fixture.projectId,
      requestHash: sha256("signature-activate"),
    });
    assert.equal(activated.engagement.status, "active");
  }
);

guardedTest(
  "R2-01: recipient list and detail agree on a revoked grant",
  async () => {
    const fixture = await seedFixture("disclosure-consistency", {
      serviceMode: "self_service",
    });
    const resourceId = randomUUID();
    const resource: SyntheticResource = {
      fingerprint: "doc-v1-recordable",
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      resourceCategory: "project_document",
      resourceId,
      version: 1,
    };
    const engagements = repository([resource]);
    const observation = resourceObservation(resource);

    const grant = await engagements.createDisclosureGrant({
      actorUserId: fixture.ownerUserId,
      assignmentId: fixture.assignmentId,
      expectedProjectRevision: fixture.projectRevision,
      expiresAt: null,
      observationAdapterCode: "synthetic_test_resource_resolver",
      operationId: operationKey("consistency-grant"),
      projectId: fixture.projectId,
      purposeCode: "professional_review",
      requestHash: sha256("consistency-grant"),
      resource: resourceSnapshot(resource),
      resourceCategory: resource.resourceCategory,
      resourceId,
      resourceObservationSha256: observation,
      resourceVersion: resource.version,
    });

    // Visible in both projections while current.
    const listBefore = await engagements.listDisclosureGrants({
      actorUserId: fixture.lawyerUserId,
      limit: 10,
      projectId: fixture.projectId,
    });
    assert.equal(listBefore.scope, "recipient");
    assert.equal(listBefore.items.length, 1);
    assert.equal(listBefore.hasMore, false);
    const detailBefore = await engagements.loadDisclosureAccessContext({
      actorUserId: fixture.lawyerUserId,
      grantId: grant.grant.grantId,
      projectId: fixture.projectId,
    });
    assert.equal(detailBefore.accessRole, "recipient_current");
    assert.equal(detailBefore.metadataAuthorized, true);

    // Revocation removes metadata from list *and* detail, with no count leak.
    await engagements.revokeDisclosureGrant({
      actorUserId: fixture.ownerUserId,
      expectedProjectRevision: grant.projectRevision,
      grantId: grant.grant.grantId,
      operationId: operationKey("consistency-revoke"),
      projectId: fixture.projectId,
      reasonCode: "owner_revoked",
      requestHash: sha256("consistency-revoke"),
    });
    const listAfter = await engagements.listDisclosureGrants({
      actorUserId: fixture.lawyerUserId,
      limit: 10,
      projectId: fixture.projectId,
    });
    assert.deepEqual(listAfter.items, []);
    assert.equal(listAfter.hasMore, false);
    await expectServiceError(
      engagements.loadDisclosureAccessContext({
        actorUserId: fixture.lawyerUserId,
        grantId: grant.grant.grantId,
        projectId: fixture.projectId,
      }),
      "not_found"
    );

    // The owner keeps the audit view of their own historical grant.
    const ownerAudit = await engagements.loadDisclosureAccessContext({
      actorUserId: fixture.ownerUserId,
      grantId: grant.grant.grantId,
      projectId: fixture.projectId,
    });
    assert.equal(ownerAudit.accessRole, "resource_owner_audit");
    assert.equal(ownerAudit.grant?.status, "revoked");
  }
);

guardedTest(
  "R2-01/R1-03: revoking the resource owner's membership invalidates the grant",
  async () => {
    const fixture = await seedFixture("owner-membership", {
      serviceMode: "self_service",
    });
    const sql = client();
    const memberUserId = randomUUID();
    try {
      await sql`
        INSERT INTO "User" ("id", "email", "role", "emailVerifiedAt")
        VALUES (${memberUserId}, ${`m4-004-member-${randomUUID().slice(0, 8)}@example.test`}, 'user', now())
      `;
      // Supported contract: owner invite → member accept (both bump the revision).
      const membership = await seedActiveProjectMember({
        expectedRevision: fixture.projectRevision,
        memberUserId,
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
      });
      assert.ok(membership.membershipId.length > 0);

      const resource: SyntheticResource = {
        fingerprint: "doc-v1-member",
        ownerUserId: memberUserId,
        projectId: fixture.projectId,
        resourceCategory: "project_document",
        resourceId: randomUUID(),
        version: 1,
      };
      const engagements = repository([resource]);
      const grant = await engagements.createDisclosureGrant({
        actorUserId: memberUserId,
        assignmentId: fixture.assignmentId,
        expectedProjectRevision: membership.projectRevision,
        expiresAt: null,
        observationAdapterCode: "synthetic_test_resource_resolver",
        operationId: operationKey("member-grant"),
        projectId: fixture.projectId,
        purposeCode: "professional_review",
        requestHash: sha256("member-grant"),
        resource: resourceSnapshot(resource),
        resourceCategory: resource.resourceCategory,
        resourceId: resource.resourceId,
        resourceObservationSha256: resourceObservation(resource),
        resourceVersion: resource.version,
      });

      // Current state: the recipient can read the metadata.
      const before = await engagements.loadDisclosureAccessContext({
        actorUserId: fixture.lawyerUserId,
        grantId: grant.grant.grantId,
        projectId: fixture.projectId,
      });
      assert.equal(before.resourceOwnerEligible, true);

      // Revoke the resource owner's Project membership through the supported
      // owner-only contract (append-only; it also bumps the Project revision).
      const revokedMembership =
        await createProjectFoundationRepository().revokeProjectMembership({
          actorUserId: fixture.ownerUserId,
          expectedRevision: grant.projectRevision,
          membershipId: membership.membershipId,
          operationId: operationKey("member-revoke-membership"),
          projectId: fixture.projectId,
        });
      assert.equal(revokedMembership.replayed, false);

      // FIX-02: R2 policy denies the recipient *metadata* entirely once the
      // resource owner loses eligibility — the lawyer must see `not_found`, not a
      // context object that quotes the grant with an eligibility flag.
      await expectServiceError(
        engagements.loadDisclosureAccessContext({
          actorUserId: fixture.lawyerUserId,
          grantId: grant.grant.grantId,
          projectId: fixture.projectId,
        }),
        "not_found"
      );
      const list = await engagements.listDisclosureGrants({
        actorUserId: fixture.lawyerUserId,
        limit: 10,
        projectId: fixture.projectId,
      });
      assert.deepEqual(list.items, []);
      assert.equal(list.hasMore, false);

      // A former member may not revoke their historical grant (403, not 404). The
      // eligibility check precedes the revision check, so the current revision is
      // supplied to prove the refusal is authorization-driven.
      await expectServiceError(
        engagements.revokeDisclosureGrant({
          actorUserId: memberUserId,
          expectedProjectRevision: revokedMembership.project.revision,
          grantId: grant.grant.grantId,
          operationId: operationKey("member-revoke"),
          projectId: fixture.projectId,
          reasonCode: "owner_revoked",
          requestHash: sha256("member-revoke"),
        }),
        "forbidden"
      );
      // The recorded owner keeps the audit view of the record itself.
      const audit = await engagements.loadDisclosureAccessContext({
        actorUserId: memberUserId,
        grantId: grant.grant.grantId,
        projectId: fixture.projectId,
      });
      assert.equal(audit.accessRole, "resource_owner_audit");
    } finally {
      await closeLazyDatabase();
      await sql.end({ timeout: 5 });
    }
  }
);

guardedTest(
  "R1-06: the installed scope CHECKs use the cardinality predicate",
  async () => {
    // Catalog identity only: the *behaviour* of the deployed expression is
    // exercised in the FIX-DB scenario. `array_length(...)` is deliberately
    // forbidden because it returns NULL for an empty array, which a CHECK accepts.
    const sql = client();
    try {
      const rows = await sql<
        { name: string; definition: string; relation: string }[]
      >`
        SELECT con.conname AS name,
               pg_get_constraintdef(con.oid) AS definition,
               con.conrelid::regclass::text AS relation
        FROM pg_constraint con
        WHERE con.contype = 'c'
          AND con.conname IN (
            'ServiceEngagement_scope_check',
            'ServiceAgreementVersion_scope_check'
          )
          AND con.conrelid IN (
            to_regclass('public."ServiceEngagement"'),
            to_regclass('public."ServiceAgreementVersion"')
          )
        ORDER BY con.conname
      `;
      assert.deepEqual(
        rows.map((row) => row.name),
        ["ServiceAgreementVersion_scope_check", "ServiceEngagement_scope_check"]
      );
      for (const row of rows) {
        assert.match(row.definition, /cardinality/u, row.name);
        assert.match(row.definition, /IS NOT NULL/u, row.name);
        // Do NOT assert a textual bound form here: PostgreSQL 17 deparses
        // `cardinality(...) BETWEEN 1 AND 2` as `(cardinality(...) >= 1) AND
        // (cardinality(...) <= 2)` (Stage 3B evidence, F2). The 1–2 element and
        // allowlist behaviour is proven executably in the FIX-DB scenario instead.
        assert.equal(
          /cardinality\("scopeCodes"\) (>=|<|>|<=)/u.test(row.definition),
          true,
          row.name
        );
        assert.match(row.definition, /school_admissions/u, row.name);
        assert.match(row.definition, /student_500_visa/u, row.name);
        assert.equal(row.definition.includes("array_length"), false, row.name);
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);

guardedTest(
  "R1-06: the current agreement FK is composite on (id, engagementId)",
  async () => {
    // A4: identity comes from OIDs and ordered column mapping, never from the
    // deparsed text (PostgreSQL prints `id` without quotes while quoting mixed-case
    // identifiers, so a textual assertion is brittle).
    const sql = client();
    try {
      const [row] = await sql<
        {
          isForeignKey: boolean;
          sourceIsEngagement: boolean;
          targetIsAgreementVersion: boolean;
          targetSchemaIsPublic: boolean;
          sourceColumns: string[];
          targetColumns: string[];
          deferrable: boolean;
          onDelete: string;
          onUpdate: string;
        }[]
      >`
        SELECT con.contype = 'f' AS "isForeignKey",
               con.conrelid = to_regclass('public."ServiceEngagement"')
                 AS "sourceIsEngagement",
               con.confrelid = to_regclass('public."ServiceAgreementVersion"')
                 AS "targetIsAgreementVersion",
               (SELECT n.nspname = 'public'
                FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.oid = con.confrelid) AS "targetSchemaIsPublic",
               ARRAY(
                 SELECT a.attname
                 FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a
                   ON a.attrelid = con.conrelid AND a.attnum = k.attnum
                 ORDER BY k.ord
               ) AS "sourceColumns",
               ARRAY(
                 SELECT a.attname
                 FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a
                   ON a.attrelid = con.confrelid AND a.attnum = k.attnum
                 ORDER BY k.ord
               ) AS "targetColumns",
               con.condeferrable AS "deferrable",
               con.confdeltype::text AS "onDelete",
               con.confupdtype::text AS "onUpdate"
        FROM pg_constraint con
        WHERE con.conname = 'ServiceEngagement_current_agreement_fk'
          AND con.conrelid = to_regclass('public."ServiceEngagement"')
      `;
      assert.ok(row, "composite current-agreement FK must exist");
      assert.equal(row?.isForeignKey, true);
      assert.equal(row?.sourceIsEngagement, true);
      assert.equal(row?.targetIsAgreementVersion, true);
      assert.equal(row?.targetSchemaIsPublic, true);
      assert.deepEqual(row?.sourceColumns, ["currentAgreementVersionId", "id"]);
      assert.deepEqual(row?.targetColumns, ["id", "engagementId"]);
      assert.equal(row?.deferrable, false);
      assert.equal(row?.onDelete, "r");
      assert.equal(row?.onUpdate, "a");
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);

guardedTest(
  "concurrency and idempotency serialize on the Project revision",
  async () => {
    const fixture = await seedFixture("concurrency");
    const engagements = repository();
    const operationId = operationKey("concurrency-replay");
    const first = await engagements.transitionEngagement({
      action: "terminate",
      actorUserId: fixture.ownerUserId,
      engagementId: fixture.engagementId,
      expectedProjectRevision: fixture.projectRevision,
      operationId,
      projectId: fixture.projectId,
      requestHash: sha256("concurrency-replay"),
    });
    assert.equal(first.replayed, false);
    assert.equal(first.engagement.status, "terminated");

    // Identical replay returns the original outcome. The replay branch is reached
    // before the revision check, so the now-stale revision is intentionally reused
    // here to demonstrate replay-before-revalidation.
    const replay = await engagements.transitionEngagement({
      action: "terminate",
      actorUserId: fixture.ownerUserId,
      engagementId: fixture.engagementId,
      expectedProjectRevision: fixture.projectRevision,
      operationId,
      projectId: fixture.projectId,
      requestHash: sha256("concurrency-replay"),
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.projectRevision, first.projectRevision);

    // A changed request under the same operation id conflicts. The action must stay
    // the same: the operation key is (actor, operation type, operation id), so a
    // different action would be a *new* operation and would fail for a different
    // reason (revision_conflict) rather than as an idempotency conflict.
    await expectServiceError(
      engagements.transitionEngagement({
        action: "terminate",
        actorUserId: fixture.ownerUserId,
        engagementId: fixture.engagementId,
        expectedProjectRevision: fixture.projectRevision,
        operationId,
        projectId: fixture.projectId,
        requestHash: sha256("concurrency-replay-changed"),
      }),
      "idempotency_conflict"
    );

    // Two concurrent terminal transitions: exactly one wins, the other loses on
    // the stale Project revision (row lock then revision compare).
    const other = await seedFixture("concurrency-race");
    const results = await Promise.allSettled([
      repository().transitionEngagement({
        action: "terminate",
        actorUserId: other.ownerUserId,
        engagementId: other.engagementId,
        expectedProjectRevision: other.projectRevision,
        operationId: operationKey("race-a"),
        projectId: other.projectId,
        requestHash: sha256("race-a"),
      }),
      repository().transitionEngagement({
        action: "terminate",
        actorUserId: other.ownerUserId,
        engagementId: other.engagementId,
        expectedProjectRevision: other.projectRevision,
        operationId: operationKey("race-b"),
        projectId: other.projectId,
        requestHash: sha256("race-b"),
      }),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    assert.equal(fulfilled.length, 1);
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(rejected.length, 1);
    const rejection = rejected[0]?.reason as unknown;
    assert.ok(
      rejection instanceof ServiceEngagementError &&
        rejection.code === "revision_conflict",
      "the losing concurrent transition must fail on the revision conflict"
    );
  }
);

guardedTest(
  "database guard triggers reject mutation and deletion",
  async () => {
    const fixture = await seedFixture("guard");
    const sql = client();
    try {
      // `student_500_visa` is itself an allowed scope code, so a 23514 here cannot
      // come from the scope CHECK: it is the append-only guard rejecting a direct
      // identity mutation.
      const update = await sql`
        UPDATE "ServiceEngagement" SET "scopeCodes" = ARRAY['student_500_visa']::text[]
        WHERE "id" = ${fixture.engagementId}
      `.then(
        () => undefined,
        (error: unknown) => pgErrorDetails(error)
      );
      assert.equal(update?.code, "23514");

      let deleteDetails: PgErrorDetails | undefined;
      try {
        await sql`DELETE FROM "ServiceEngagement" WHERE "id" = ${fixture.engagementId}`;
      } catch (error) {
        deleteDetails = pgErrorDetails(error);
      }
      assert.equal(deleteDetails?.code, "23514");

      // The row and its scope survived both rejected statements.
      const [row] = await sql<{ scopeCodes: string[]; status: string }[]>`
        SELECT "scopeCodes", "status" FROM "ServiceEngagement" WHERE "id" = ${fixture.engagementId}
      `;
      assert.deepEqual(row?.scopeCodes, ["school_admissions"]);
      assert.equal(row?.status, "draft");
    } finally {
      await closeLazyDatabase();
      await sql.end({ timeout: 5 });
    }
  }
);

guardedTest(
  "FIX-03: the agreement write boundary rejects non-canonical terms",
  async () => {
    const fixture = await seedFixture("terms-boundary");
    const engagements = repository();
    const terms = canonicalTerms({
      scopeCodes: ["school_admissions"],
      serviceMode: "managed",
    });
    const draftId = agreementVersionId();
    const authority = await engagements.loadServiceOperatorContext({
      action: "author_draft",
      actorUserId: fixture.lawyerUserId,
      draft: {
        agreementVersionId: draftId,
        scopeCodes: ["school_admissions"],
        serviceMode: "managed",
        termsSha256: terms.termsSha256,
      },
      engagementId: fixture.engagementId,
      projectId: fixture.projectId,
    });
    const base = {
      actorUserId: fixture.lawyerUserId,
      agreementVersionId: draftId,
      authorityCode: "synthetic_test_contract_operator",
      authorityRequestSha256: authority.operatorAuthority.requestSha256,
      engagementId: fixture.engagementId,
      expectedProjectRevision: fixture.projectRevision,
      projectId: fixture.projectId,
      scopeCodes: ["school_admissions"] as const,
      serviceMode: "managed" as const,
      termsPayload: terms.payload,
      termsSha256: terms.termsSha256,
    };

    // (a) Semantically identical JSON in a different key order is not canonical.
    const reorderedPayload = JSON.stringify({
      title: "Synthetic M4-004 integration agreement",
      serviceMode: "managed",
      scopeCodes: ["school_admissions"],
      schemaVersion: SERVICE_AGREEMENT_TERMS_SCHEMA_VERSION,
      clauses: [
        {
          body: "Synthetic M4-004 integration clause; not legal advice and not an approved professional service term.",
          clauseId: "synthetic-scope",
          heading: "Synthetic service scope",
        },
      ],
    });
    assert.notEqual(reorderedPayload, terms.payload);
    await expectServiceError(
      () =>
        engagements.createAgreementVersion({
          ...base,
          operationId: operationKey("terms-reordered"),
          requestHash: sha256("terms-reordered"),
          termsPayload: reorderedPayload,
        }),
      "invalid_request"
    );

    // (b) A hash that does not belong to the canonical bytes.
    await expectServiceError(
      () =>
        engagements.createAgreementVersion({
          ...base,
          operationId: operationKey("terms-hash-mismatch"),
          requestHash: sha256("terms-hash-mismatch"),
          termsSha256: sha256("unrelated-arbitrary-string"),
        }),
      "invalid_request"
    );

    // (c) Canonical terms for a scope the caller does not declare.
    const otherScope = canonicalTerms({
      scopeCodes: ["student_500_visa"],
      serviceMode: "managed",
    });
    await expectServiceError(
      () =>
        engagements.createAgreementVersion({
          ...base,
          operationId: operationKey("terms-scope-mismatch"),
          requestHash: sha256("terms-scope-mismatch"),
          termsPayload: otherScope.payload,
          termsSha256: otherScope.termsSha256,
        }),
      "invalid_request"
    );

    // (d) Canonical terms for a different service mode.
    const selfServiceTerms = canonicalTerms({
      scopeCodes: ["school_admissions"],
      serviceMode: "self_service",
    });
    await expectServiceError(
      () =>
        engagements.createAgreementVersion({
          ...base,
          operationId: operationKey("terms-mode-mismatch"),
          requestHash: sha256("terms-mode-mismatch"),
          termsPayload: selfServiceTerms.payload,
          termsSha256: selfServiceTerms.termsSha256,
        }),
      "invalid_request"
    );

    // (e) Not JSON at all.
    await expectServiceError(
      () =>
        engagements.createAgreementVersion({
          ...base,
          operationId: operationKey("terms-not-json"),
          requestHash: sha256("terms-not-json"),
          termsPayload: "not-json",
        }),
      "invalid_request"
    );

    // Nothing above created a draft for this engagement.
    const engagementAfterRejections = await engagements.getEngagement({
      actorUserId: fixture.ownerUserId,
      engagementId: fixture.engagementId,
      projectId: fixture.projectId,
    });
    assert.equal(
      engagementAfterRejections.engagement.agreementVersions.length,
      0
    );

    // Positive control: the canonical payload is accepted and stored verbatim.
    const created = await engagements.createAgreementVersion({
      ...base,
      operationId: operationKey("terms-canonical"),
      requestHash: sha256("terms-canonical"),
    });
    assert.equal(created.replayed, false);
    assert.equal(created.agreementVersion.agreementVersionId, draftId);
    const sql = client();
    try {
      const [stored] = await sql<
        { termsPayload: string; termsSha256: string }[]
      >`
        SELECT "termsPayload", "termsSha256"
        FROM "ServiceAgreementVersion" WHERE "id" = ${draftId}
      `;
      assert.equal(stored?.termsPayload, terms.payload);
      assert.equal(stored?.termsSha256, terms.termsSha256);
    } finally {
      await closeLazyDatabase();
      await sql.end({ timeout: 5 });
    }
  }
);

guardedTest(
  "FIX-04: interleaved eligible/ineligible grants page exactly",
  async () => {
    const fixture = await seedFixture("pagination", {
      serviceMode: "self_service",
    });
    const sql = client();
    const eligibleMemberUserId = randomUUID();
    const revokedMemberUserId = randomUUID();
    try {
      await sql`
        INSERT INTO "User" ("id", "email", "role", "emailVerifiedAt")
        VALUES (${eligibleMemberUserId}, ${`m4-004-pg-a-${randomUUID().slice(0, 8)}@example.test`}, 'user', now()),
               (${revokedMemberUserId}, ${`m4-004-pg-b-${randomUUID().slice(0, 8)}@example.test`}, 'user', now())
      `;
      // Supported contract for both members; each invite/accept pair bumps the
      // Project revision, so the revision is threaded through explicitly.
      let revision = fixture.projectRevision;
      let revokedMembershipId = "";
      for (const memberUserId of [eligibleMemberUserId, revokedMemberUserId]) {
        const membership = await seedActiveProjectMember({
          expectedRevision: revision,
          memberUserId,
          ownerUserId: fixture.ownerUserId,
          projectId: fixture.projectId,
        });
        revision = membership.projectRevision;
        if (memberUserId === revokedMemberUserId) {
          revokedMembershipId = membership.membershipId;
        }
      }

      const resources: SyntheticResource[] = [];
      const makeResource = (ownerUserId: string, index: number) => {
        const resource: SyntheticResource = {
          fingerprint: `doc-pg-${index}`,
          ownerUserId,
          projectId: fixture.projectId,
          resourceCategory: "project_document",
          resourceId: randomUUID(),
          version: 1,
        };
        resources.push(resource);
        return resource;
      };
      // Interleave: eligible A, ineligible B, eligible A, ineligible B.
      const plan = [
        { index: 1, owner: eligibleMemberUserId },
        { index: 2, owner: revokedMemberUserId },
        { index: 3, owner: eligibleMemberUserId },
        { index: 4, owner: revokedMemberUserId },
      ] as const;

      const grantedIds: { eligible: string[]; ineligible: string[] } = {
        eligible: [],
        ineligible: [],
      };
      for (const step of plan) {
        const resource = makeResource(step.owner, step.index);
        // Each repository instance revalidates against every resource created so
        // far, so the observation it is given is the current one.
        const engagements = repository(resources);
        const grant = await engagements.createDisclosureGrant({
          actorUserId: step.owner,
          assignmentId: fixture.assignmentId,
          expectedProjectRevision: revision,
          expiresAt: null,
          observationAdapterCode: "synthetic_test_resource_resolver",
          operationId: operationKey(`pagination-${step.index}`),
          projectId: fixture.projectId,
          purposeCode: "professional_review",
          requestHash: sha256(`pagination-${step.index}`),
          resource: resourceSnapshot(resource),
          resourceCategory: resource.resourceCategory,
          resourceId: resource.resourceId,
          resourceObservationSha256: resourceObservation(resource),
          resourceVersion: resource.version,
        });
        revision = grant.projectRevision;
        if (step.owner === eligibleMemberUserId) {
          grantedIds.eligible.push(grant.grant.grantId);
        } else {
          grantedIds.ineligible.push(grant.grant.grantId);
        }
      }

      const engagements = repository(resources);
      // Before revocation all four are authorized.
      const all = await engagements.listDisclosureGrants({
        actorUserId: fixture.lawyerUserId,
        limit: 10,
        projectId: fixture.projectId,
      });
      assert.equal(all.items.length, 4);
      assert.equal(all.hasMore, false);

      // One owner loses Project membership: its grants become unauthorized.
      const revokedMembership =
        await createProjectFoundationRepository().revokeProjectMembership({
          actorUserId: fixture.ownerUserId,
          expectedRevision: revision,
          membershipId: revokedMembershipId,
          operationId: operationKey("pagination-member-revoke"),
          projectId: fixture.projectId,
        });
      assert.equal(revokedMembership.replayed, false);

      // Page 1 of 1 must contain an *authorized* grant, never an ineligible one,
      // and `hasMore` must reflect that a second authorized grant remains even
      // though ineligible rows sort between them.
      const firstPage = await engagements.listDisclosureGrants({
        actorUserId: fixture.lawyerUserId,
        limit: 1,
        projectId: fixture.projectId,
      });
      assert.equal(firstPage.items.length, 1);
      assert.equal(firstPage.hasMore, true);
      assert.equal(
        grantedIds.eligible.includes(firstPage.items[0]?.grantId ?? ""),
        true
      );

      const secondPage = await engagements.listDisclosureGrants({
        actorUserId: fixture.lawyerUserId,
        limit: 2,
        projectId: fixture.projectId,
      });
      assert.equal(secondPage.items.length, 2);
      assert.equal(secondPage.hasMore, false);
      const returned = secondPage.items.map((item) => item.grantId).sort();
      assert.deepEqual(returned, [...grantedIds.eligible].sort());
      for (const ineligibleId of grantedIds.ineligible) {
        assert.equal(returned.includes(ineligibleId), false);
      }
    } finally {
      await closeLazyDatabase();
      await sql.end({ timeout: 5 });
    }
  }
);

guardedTest(
  "FIX-DB: equivalent probe constraints reject empty scope and cross-engagement references",
  async () => {
    // Direct writes to the append-only production tables are impossible: the BEFORE
    // guards reject any row that is not backed by a fresh operation/event (asserted
    // in the guard-trigger scenario). Behaviour is therefore exercised on
    // session-local `pg_temp` tables:
    //
    //   1. the scope probe replays the *deployed* CHECK expression for the exact
    //      relation OID, so the predicate under test is the installed one;
    //   2. the FK probe is constructed explicitly against a *temporary* agreement
    //      table and verified through `pg_constraint.confrelid`, so the reference
    //      cannot silently resolve to the permanent table.
    //
    // What this proves: the deployed definitions reject the bad rows in a real
    // PostgreSQL session. What it does not prove: production-table triggers,
    // operation/event bookkeeping or the repository contract — those are covered by
    // the behavioural scenarios above, not by this probe.
    const sql = client();
    const session = await sql.reserve();
    try {
      const [before] = await session<
        { agreements: number; engagements: number }[]
      >`
        SELECT
          (SELECT count(*)::int FROM public."ServiceAgreementVersion") AS agreements,
          (SELECT count(*)::int FROM public."ServiceEngagement") AS engagements
      `;

      // --- 1. Deployed scope CHECK expression on the exact relation -------------
      const [scopeConstraint] = await session<
        { definition: string; relationOid: number }[]
      >`
        SELECT pg_get_constraintdef(con.oid) AS definition,
               con.conrelid::oid::int AS "relationOid"
        FROM pg_constraint con
        WHERE con.conname = 'ServiceEngagement_scope_check'
          AND con.contype = 'c'
          AND con.conrelid = to_regclass('public."ServiceEngagement"')
      `;
      assert.ok(scopeConstraint, "installed scope CHECK must exist");
      assert.match(scopeConstraint.definition, /^CHECK \(/u);
      assert.match(scopeConstraint.definition, /cardinality/u);
      assert.match(scopeConstraint.definition, /"scopeCodes"/u);
      // The expression replayed below belongs to the permanent engagement table.
      const [engagementRelation] = await session<{ oid: number }[]>`
        SELECT to_regclass('public."ServiceEngagement"')::oid::int AS oid
      `;
      assert.equal(scopeConstraint.relationOid, engagementRelation?.oid);

      await session.unsafe(
        `CREATE TEMP TABLE m4_004_scope_probe ("scopeCodes" text[])`
      );
      await session.unsafe(
        `ALTER TABLE m4_004_scope_probe ADD CONSTRAINT m4_004_probe_scope ${scopeConstraint.definition}`
      );

      // Negative control: an empty array is rejected by the deployed predicate
      // (`array_length` would be NULL here and a NULL CHECK passes; `cardinality`
      // is used instead).
      const emptyScope = await session
        .unsafe(
          `INSERT INTO m4_004_scope_probe ("scopeCodes") VALUES ('{}'::text[])`
        )
        .then(
          () => undefined,
          (error: unknown) => pgErrorDetails(error)
        );
      assert.equal(emptyScope?.code, "23514");
      assert.equal(emptyScope?.constraint, "m4_004_probe_scope");

      // Positive control: one and two permitted codes are accepted, which is what
      // the deparsed `>= 1 / <= 2` bounds mean in practice (F2 replacement for a
      // textual `BETWEEN` assertion).
      await session.unsafe(
        `INSERT INTO m4_004_scope_probe ("scopeCodes") VALUES ('{school_admissions}'::text[])`
      );
      await session.unsafe(
        `INSERT INTO m4_004_scope_probe ("scopeCodes") VALUES ('{student_500_visa,school_admissions}'::text[])`
      );

      // Negative controls: three codes exceed the upper bound, and an unknown code
      // is outside the allowlist. Both must be rejected by the same deployed
      // constraint.
      const tooManyScopes = await session
        .unsafe(
          `INSERT INTO m4_004_scope_probe ("scopeCodes") VALUES ('{school_admissions,student_500_visa,school_admissions}'::text[])`
        )
        .then(
          () => undefined,
          (error: unknown) => pgErrorDetails(error)
        );
      assert.equal(tooManyScopes?.code, "23514");
      assert.equal(tooManyScopes?.constraint, "m4_004_probe_scope");

      const unknownScope = await session
        .unsafe(
          `INSERT INTO m4_004_scope_probe ("scopeCodes") VALUES ('{not_a_scope}'::text[])`
        )
        .then(
          () => undefined,
          (error: unknown) => pgErrorDetails(error)
        );
      assert.equal(unknownScope?.code, "23514");
      assert.equal(unknownScope?.constraint, "m4_004_probe_scope");

      // --- 2. Explicit equivalent composite FK on temporary tables -------------
      // Deliberately *not* named like the production tables: the reference below is
      // written against the temporary relation, and its target is verified by OID.
      await session.unsafe(
        `CREATE TEMP TABLE m4_004_agreement_probe (
           "id" uuid NOT NULL,
           "engagementId" uuid NOT NULL,
           CONSTRAINT m4_004_agreement_probe_pair UNIQUE ("id", "engagementId")
         )`
      );
      await session.unsafe(
        `CREATE TEMP TABLE m4_004_engagement_probe (
           "id" uuid NOT NULL PRIMARY KEY,
           "currentAgreementVersionId" uuid,
           CONSTRAINT m4_004_current_agreement_probe
             FOREIGN KEY ("currentAgreementVersionId", "id")
             REFERENCES m4_004_agreement_probe ("id", "engagementId")
             ON DELETE RESTRICT ON UPDATE NO ACTION
         )`
      );

      // The probe constraint must reference the temporary relation, not the
      // permanent one, and the two must be different objects.
      const [probe] = await session<
        {
          targetsTempRelation: boolean;
          targetInTempSchema: boolean;
          targetDiffersFromPermanent: boolean;
          sourceColumns: string[];
          targetColumns: string[];
        }[]
      >`
        SELECT con.confrelid = to_regclass('m4_004_agreement_probe')
                 AS "targetsTempRelation",
               (SELECT relnamespace FROM pg_class WHERE oid = con.confrelid)
                 = pg_my_temp_schema() AS "targetInTempSchema",
               con.confrelid <> to_regclass('public."ServiceAgreementVersion"')
                 AS "targetDiffersFromPermanent",
               ARRAY(
                 SELECT a.attname
                 FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a
                   ON a.attrelid = con.conrelid AND a.attnum = k.attnum
                 ORDER BY k.ord
               ) AS "sourceColumns",
               ARRAY(
                 SELECT a.attname
                 FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a
                   ON a.attrelid = con.confrelid AND a.attnum = k.attnum
                 ORDER BY k.ord
               ) AS "targetColumns"
        FROM pg_constraint con
        WHERE con.conname = 'm4_004_current_agreement_probe'
          AND con.conrelid = to_regclass('m4_004_engagement_probe')
      `;
      assert.ok(probe, "probe FK must exist");
      assert.equal(probe.targetsTempRelation, true);
      assert.equal(probe.targetInTempSchema, true);
      assert.equal(probe.targetDiffersFromPermanent, true);
      assert.deepEqual(probe.sourceColumns, [
        "currentAgreementVersionId",
        "id",
      ]);
      assert.deepEqual(probe.targetColumns, ["id", "engagementId"]);

      const engagementA = randomUUID();
      const engagementB = randomUUID();
      const versionA = randomUUID();
      await session.unsafe(
        `INSERT INTO m4_004_agreement_probe ("id", "engagementId") VALUES ($1, $2)`,
        [versionA, engagementA]
      );

      // Positive control: the agreement version belongs to the *same* engagement,
      // so `(currentAgreementVersionId, id)` matches `(id, engagementId)`.
      await session.unsafe(
        `INSERT INTO m4_004_engagement_probe ("id", "currentAgreementVersionId")
         VALUES ($1, $2)`,
        [engagementA, versionA]
      );

      // Negative control: a different engagement (engagementB) pointing at
      // engagementA's version violates only the composite FK.
      const cross = await session
        .unsafe(
          `INSERT INTO m4_004_engagement_probe ("id", "currentAgreementVersionId")
           VALUES ($1, $2)`,
          [engagementB, versionA]
        )
        .then(
          () => undefined,
          (error: unknown) => pgErrorDetails(error)
        );
      assert.equal(cross?.code, "23503");
      assert.equal(cross?.constraint, "m4_004_current_agreement_probe");

      // Only the positive engagement row exists in the probe tables.
      const [probeCounts] = await session<
        { engagements: number; agreements: number }[]
      >`
        SELECT
          (SELECT count(*)::int FROM m4_004_engagement_probe) AS engagements,
          (SELECT count(*)::int FROM m4_004_agreement_probe) AS agreements
      `;
      assert.equal(probeCounts?.engagements, 1);
      assert.equal(probeCounts?.agreements, 1);

      // No production row was created, changed or removed by this scenario.
      const [after] = await session<
        { agreements: number; engagements: number }[]
      >`
        SELECT
          (SELECT count(*)::int FROM public."ServiceAgreementVersion") AS agreements,
          (SELECT count(*)::int FROM public."ServiceEngagement") AS engagements
      `;
      assert.equal(after?.agreements, before?.agreements);
      assert.equal(after?.engagements, before?.engagements);
    } finally {
      session.release();
      await sql.end({ timeout: 5 });
    }
  }
);
