import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type {
  ProjectFactAssertion,
  ProjectFactPublication,
  ProjectFactRepository,
  ProjectFactUseGrant,
} from "../project-facts/facts";
import { createProjectFactManagementService } from "../project-facts/facts";
import { mapProjectFactAssertion } from "../projects/project-context";
import {
  createSyntheticEducationFixture,
  type SyntheticEducationFixture,
} from "./fixtures";
import {
  computeEducationCriterionBindingSha256,
  type EducationCriterionReviewAuthority,
  type ReviewedEducationCriterion,
  type TrustedEducationCriterionApproval,
} from "./option-comparison";
import {
  buildProjectPossibleOptions,
  type CurrentAuthorizedProjectOptionsContext,
  type CurrentAuthorizedProjectOptionsReader,
  ProjectPossibleOptionsError,
} from "./project-options";
import type {
  EducationCatalogReader,
  EducationCatalogReadSnapshot,
} from "./read-model";

const ACTOR = "user-a";
const PROJECT = "project-a";
const CHAT = "chat-a";
const PRIVATE_VALUE = "customer-private-value-do-not-output";
const ASSESSED_AT = "2026-10-27T12:00:00.000Z";
const ASSESSMENT_DATE = "2026-10-27";

function assertion(
  id: string,
  key: string,
  value: unknown,
  overrides: Partial<ProjectFactAssertion> = {}
): ProjectFactAssertion {
  return {
    id,
    projectId: PROJECT,
    key,
    valueType: "json",
    value,
    normalizedComparison: `normalized-${id}`,
    originKind: "customer_stated",
    state: "customer_confirmed",
    sourceEvidenceRef: null,
    createdByUserId: ACTOR,
    confirmedByUserId: ACTOR,
    effectiveFrom: null,
    effectiveTo: null,
    observedAt: "2026-10-26T00:00:00.000Z",
    supersedesAssertionId: null,
    version: 1,
    stale: false,
    ...overrides,
  };
}

function fixtureProjection() {
  const authorized = assertion("fact-authorized", "language.testscore", {
    value: 7,
    unit: "IELTS",
  });
  const unpublished = assertion(
    "fact-unpublished",
    "private.unpublished",
    PRIVATE_VALUE
  );
  const stale = assertion("fact-stale", "private.stale", PRIVATE_VALUE, {
    stale: true,
  });
  const conflicted = assertion(
    "fact-conflicted",
    "private.conflicted",
    PRIVATE_VALUE
  );
  const conflictPeer = assertion(
    "fact-conflict-peer",
    "private.conflicted.peer",
    PRIVATE_VALUE
  );
  const assertions = [authorized, unpublished, stale, conflicted, conflictPeer];
  const publications: ProjectFactPublication[] = [
    {
      assertionId: authorized.id,
      assertionVersion: 1,
      actorUserId: ACTOR,
      audience: "actor_only",
      active: true,
    },
    {
      assertionId: stale.id,
      assertionVersion: 1,
      actorUserId: ACTOR,
      audience: "actor_only",
      active: true,
    },
    {
      assertionId: conflicted.id,
      assertionVersion: 1,
      actorUserId: ACTOR,
      audience: "actor_only",
      active: true,
    },
    {
      assertionId: conflictPeer.id,
      assertionVersion: 1,
      actorUserId: ACTOR,
      audience: "actor_only",
      active: true,
    },
  ];
  const grants: ProjectFactUseGrant[] = [
    {
      assertionId: authorized.id,
      assertionVersion: 1,
      actorUserId: ACTOR,
      purpose: "ai_context",
      audience: "actor_only",
      active: true,
    },
    {
      assertionId: stale.id,
      assertionVersion: 1,
      actorUserId: ACTOR,
      purpose: "ai_context",
      audience: "actor_only",
      active: true,
    },
    {
      assertionId: conflicted.id,
      assertionVersion: 1,
      actorUserId: ACTOR,
      purpose: "ai_context",
      audience: "actor_only",
      active: true,
    },
    {
      assertionId: conflictPeer.id,
      assertionVersion: 1,
      actorUserId: ACTOR,
      purpose: "ai_context",
      audience: "actor_only",
      active: true,
    },
  ];
  return {
    assertions,
    publications,
    grants,
    conflicts: [
      {
        id: "unresolved-conflict",
        projectId: PROJECT,
        leftAssertionId: conflicted.id,
        rightAssertionId: "fact-conflict-peer",
        kind: "conflict" as const,
        resolvedAt: null,
      },
    ],
  };
}

function authorityReader(
  input: {
    readonly projection?: ReturnType<typeof fixtureProjection>;
    readonly next?: (
      count: number,
      base: CurrentAuthorizedProjectOptionsContext
    ) => CurrentAuthorizedProjectOptionsContext;
    readonly override?: Partial<CurrentAuthorizedProjectOptionsContext>;
  } = {}
): {
  readonly reader: CurrentAuthorizedProjectOptionsReader;
  readonly calls: () => number;
} {
  const source = input.projection ?? fixtureProjection();
  const service = createProjectFactManagementService({
    repository: {
      projection() {
        return Promise.resolve(source);
      },
    } as unknown as ProjectFactRepository,
  });
  let count = 0;
  const reader: CurrentAuthorizedProjectOptionsReader = {
    async readCurrentAuthorizedContext(request) {
      count += 1;
      const projection = await service.stableProjection({
        actorUserId: request.actorUserId,
        projectId: request.projectId,
      });
      const base: CurrentAuthorizedProjectOptionsContext = {
        actorUserId: request.actorUserId,
        projectId: request.projectId,
        chatId: request.chatId,
        projectStatus: "ACTIVE",
        membershipStatus: "OWNER",
        chatStatus: "ACTIVE",
        chatOwnerUserId: request.actorUserId,
        chatProjectId: request.projectId,
        projectChatEnabled: true,
        projectContextEnabled: true,
        factsProjectionAvailable: projection.available,
        accessRevision: "access-1",
        projectRevision: "project-revision-1",
        membershipRevision: "member-1",
        chatRevision: "chat-1",
        factsProjectionRevision: "facts-1",
        authorizedForAI: projection.authorizedForAI.map(
          mapProjectFactAssertion
        ),
      };
      return input.next?.(count, base) ?? { ...base, ...input.override };
    },
  };
  return { reader, calls: () => count };
}

function catalogFixture(): {
  fixture: SyntheticEducationFixture;
  snapshot: EducationCatalogReadSnapshot;
} {
  const base = createSyntheticEducationFixture("VET");
  const original = base.dataset.observations.find(
    (observation) => observation.fieldKey === "COURSE_ADMISSIONS_CRITERIA"
  );
  if (!original) {
    throw new Error("Synthetic admissions observation missing.");
  }
  const quote =
    "Synthetic test admissions rule: IELTS overall score minimum 6.5.";
  const snapshotId = `${original.provenance.snapshotId}-reviewed-rule`;
  const contentSha256 = createHash("sha256")
    .update(quote, "utf8")
    .digest("hex");
  const oldSnapshot = base.dataset.snapshots.find(
    (snapshot) => snapshot.snapshotId === original.provenance.snapshotId
  );
  if (!oldSnapshot) {
    throw new Error("Synthetic admissions snapshot missing.");
  }
  const reviewedSnapshot = {
    ...oldSnapshot,
    snapshotId,
    contentSha256,
    contentExcerpt: quote,
    locator: "/fixture/reviewed-ielts-rule",
  };
  const reviewedObservation = {
    ...original,
    observationId: `${original.observationId}-reviewed-rule`,
    value: { kind: "text" as const, value: quote },
    provenance: {
      ...original.provenance,
      snapshotId,
      contentSha256,
      locator: "/fixture/reviewed-ielts-rule",
      excerpt: quote,
    },
  };
  const fixture: SyntheticEducationFixture = {
    ...base,
    dataset: {
      ...base.dataset,
      snapshots: [...base.dataset.snapshots, reviewedSnapshot],
      observations: [
        ...base.dataset.observations.filter(
          (observation) => observation.observationId !== original.observationId
        ),
        reviewedObservation,
      ],
    },
  };
  const snapshot: EducationCatalogReadSnapshot = {
    consistency: "CONSISTENT",
    snapshotToken: "catalog-consistency-1",
    complete: true,
    courseSelections: fixture.dataset.courses.map((course) => ({
      courseId: course.courseId,
      status: "FOUND",
    })),
    dataset: fixture.dataset,
  };
  return { fixture, snapshot };
}

function catalogReader(snapshot: EducationCatalogReadSnapshot) {
  let calls = 0;
  const reader: EducationCatalogReader = {
    readConsistent() {
      calls += 1;
      return Promise.resolve(snapshot);
    },
  };
  return { reader, calls: () => calls };
}

function criterion(
  fixture: SyntheticEducationFixture
): ReviewedEducationCriterion {
  const observation = fixture.dataset.observations.find(
    (item) => item.fieldKey === "COURSE_ADMISSIONS_CRITERIA"
  );
  if (!observation) {
    throw new Error("Synthetic admissions observation missing.");
  }
  return {
    criterionId: "reviewed-language-score",
    schoolField: {
      target: observation.target,
      fieldKey: observation.fieldKey,
      observationId: observation.observationId,
      snapshotId: observation.provenance.snapshotId,
    },
    ruleEvidence: {
      observationId: observation.observationId,
      snapshotId: observation.provenance.snapshotId,
      sourceId: observation.provenance.sourceId,
      sourceFamily: observation.provenance.sourceFamily,
      sourceUrl: observation.provenance.sourceUrl,
      contentSha256: observation.provenance.contentSha256,
      locator: observation.provenance.locator,
      excerpt: observation.provenance.excerpt as string,
    },
    comparator: { kind: "NUMBER_MINIMUM", threshold: 6.5, unit: "IELTS" },
    applicantFact: {
      key: "language.testscore",
      valueType: "json",
      assertionId: "fact-authorized",
      assertionVersion: 1,
    },
    applicability: { status: "APPLIES" },
    review: {
      status: "APPROVED",
      reviewId: "review-1",
      revision: "1",
    },
  };
}

function trustedReviewAuthority(
  criteria: readonly ReviewedEducationCriterion[]
): EducationCriterionReviewAuthority {
  const approvals: TrustedEducationCriterionApproval[] = criteria.map(
    (item) => ({
      status: "APPROVED",
      reviewId: item.review.reviewId,
      revision: item.review.revision,
      reviewerId: "trusted-offline-operator",
      reviewedAt: "2026-10-27T00:00:00.000Z",
      bindingSha256: computeEducationCriterionBindingSha256(item),
    })
  );
  return {
    findApproval({ reviewId, revision }) {
      return approvals.find(
        (approval) =>
          approval.reviewId === reviewId && approval.revision === revision
      );
    },
  };
}

function projectOptionsDependencies(
  authorityReader: CurrentAuthorizedProjectOptionsReader,
  catalogReader: EducationCatalogReader,
  criteria: readonly ReviewedEducationCriterion[]
) {
  return {
    authorityReader,
    catalogReader,
    reviewAuthority: trustedReviewAuthority(criteria),
  };
}

function request(
  fixture: SyntheticEducationFixture,
  criteria = [criterion(fixture)]
) {
  return {
    actor: { authenticated: true as const, userId: ACTOR },
    projectId: PROJECT,
    chatId: CHAT,
    catalog: {
      courseIds: fixture.dataset.courses.map((course) => course.courseId),
      assessedAt: ASSESSED_AT,
      assessmentDate: ASSESSMENT_DATE,
    },
    criteria,
  };
}

test("only the current M2 stableProjection authorizedForAI facts can compare; values stay private", async () => {
  const { fixture, snapshot } = catalogFixture();
  const authority = authorityReader();
  const catalog = catalogReader(snapshot);
  const projectRequest = request(fixture);
  const result = await buildProjectPossibleOptions(
    projectOptionsDependencies(
      authority.reader,
      catalog.reader,
      projectRequest.criteria
    ),
    projectRequest
  );
  assert.equal(authority.calls(), 2);
  assert.equal(catalog.calls(), 1);
  assert.equal(result.paths[0].comparisons[0].outcome, "MATCHES");
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(PRIVATE_VALUE), false);
  assert.equal(serialized.includes('"value":7'), false);
  assert.equal(result.noEligibilitySignal, true);
  assert.match(result.limitation, /no admission or visa determination/u);
});

test("unpublished, ungranted, stale, and conflicted facts never enter matching input", async () => {
  const { fixture, snapshot } = catalogFixture();
  const authority = authorityReader();
  const catalog = catalogReader(snapshot);
  const privateCriterion = criterion(fixture);
  const projectRequest = request(fixture, [
    privateCriterion,
    {
      ...privateCriterion,
      criterionId: "unpublished-private-fact",
      review: { ...privateCriterion.review, reviewId: "review-private-fact" },
      applicantFact: {
        key: "private.unpublished",
        valueType: "json",
        assertionId: "fact-unpublished",
        assertionVersion: 1,
      },
    },
  ]);
  const result = await buildProjectPossibleOptions(
    projectOptionsDependencies(
      authority.reader,
      catalog.reader,
      projectRequest.criteria
    ),
    projectRequest
  );
  assert.equal(result.paths[0].comparisons[1].outcome, "UNKNOWN");
  assert.ok(
    result.paths[0].comparisons[1].reasons.includes("MISSING_STUDENT_FACT")
  );
  assert.equal(JSON.stringify(result).includes(PRIVATE_VALUE), false);
});

test("initial unauthorized, standalone, closed, disabled, and wrong-project contexts fail before catalog access", async () => {
  const { fixture, snapshot } = catalogFixture();
  const invalid: readonly Partial<CurrentAuthorizedProjectOptionsContext>[] = [
    { membershipStatus: "REVOKED" },
    { projectStatus: "CLOSED" },
    { chatStatus: "CLOSED" },
    { projectChatEnabled: false },
    { projectContextEnabled: false },
    { factsProjectionAvailable: false },
    { chatProjectId: "project-b" },
    { chatOwnerUserId: "user-b" },
    { actorUserId: "user-b" },
    { projectId: "project-b" },
    { chatProjectId: null as unknown as string },
  ];
  for (const override of invalid) {
    const authority = authorityReader({ override });
    const catalog = catalogReader(snapshot);
    const projectRequest = request(fixture);
    await assert.rejects(
      buildProjectPossibleOptions(
        projectOptionsDependencies(
          authority.reader,
          catalog.reader,
          projectRequest.criteria
        ),
        projectRequest
      ),
      (error: unknown) => {
        assert.ok(error instanceof ProjectPossibleOptionsError);
        assert.equal((error as Error).message.includes(PRIVATE_VALUE), false);
        return true;
      }
    );
    assert.equal(catalog.calls(), 0);
  }
});

test("grant, membership, project, or actor changes during catalog read fail closed", async () => {
  const { fixture, snapshot } = catalogFixture();
  const mutation: readonly ((
    count: number,
    base: CurrentAuthorizedProjectOptionsContext
  ) => CurrentAuthorizedProjectOptionsContext)[] = [
    (count, base) =>
      count === 1
        ? base
        : {
            ...base,
            factsProjectionRevision: "grant-revoked",
            authorizedForAI: [],
          },
    (count, base) =>
      count === 1 ? base : { ...base, membershipStatus: "REVOKED" },
    (count, base) =>
      count === 1 ? base : { ...base, projectStatus: "CLOSED" },
    (count, base) => (count === 1 ? base : { ...base, projectId: "project-b" }),
    (count, base) => (count === 1 ? base : { ...base, actorUserId: "user-b" }),
  ];
  for (const next of mutation) {
    const authority = authorityReader({ next });
    const catalog = catalogReader(snapshot);
    const projectRequest = request(fixture);
    await assert.rejects(
      buildProjectPossibleOptions(
        projectOptionsDependencies(
          authority.reader,
          catalog.reader,
          projectRequest.criteria
        ),
        projectRequest
      ),
      (error: unknown) => {
        assert.ok(error instanceof ProjectPossibleOptionsError);
        assert.equal((error as Error).message.includes(PRIVATE_VALUE), false);
        return true;
      }
    );
    assert.equal(authority.calls(), 2);
    assert.equal(catalog.calls(), 1);
  }
});

test("a course path with raw admissions prose still exposes an UNKNOWN human-review item", async () => {
  const { fixture, snapshot } = catalogFixture();
  const authority = authorityReader();
  const catalog = catalogReader(snapshot);
  const projectRequest = request(fixture, []);
  const result = await buildProjectPossibleOptions(
    projectOptionsDependencies(
      authority.reader,
      catalog.reader,
      projectRequest.criteria
    ),
    projectRequest
  );
  assert.equal(result.paths[0].missingReviewedRule?.outcome, "UNKNOWN");
  assert.ok(
    result.paths[0].missingReviewedRule?.reasons.includes("MISSING_SCHOOL_RULE")
  );
  assert.equal(
    result.paths[0].path.fields.some(
      (field) =>
        field.fieldKey === "COURSE_ADMISSIONS_CRITERIA" &&
        field.status === "KNOWN"
    ),
    true
  );
});

test("malformed nested criteria fail generically before authorization or catalog reads", async () => {
  const { fixture, snapshot } = catalogFixture();
  const valid = criterion(fixture);
  const malformed: readonly unknown[] = [
    null,
    { ...valid, schoolField: null },
    {
      ...valid,
      schoolField: {
        ...valid.schoolField,
        target: { type: "CAMPUS", id: "campus-a" },
      },
    },
    {
      ...valid,
      schoolField: { ...valid.schoolField, fieldKey: "UNSUPPORTED_FIELD" },
    },
  ];
  for (const invalidCriterion of malformed) {
    const authority = authorityReader();
    const catalog = catalogReader(snapshot);
    const validRequest = request(fixture);
    const invalidRequest = {
      ...validRequest,
      criteria: [invalidCriterion],
    } as unknown as typeof validRequest;
    await assert.rejects(
      buildProjectPossibleOptions(
        projectOptionsDependencies(
          authority.reader,
          catalog.reader,
          validRequest.criteria
        ),
        invalidRequest
      ),
      (error: unknown) => error instanceof ProjectPossibleOptionsError
    );
    assert.equal(authority.calls(), 0);
    assert.equal(catalog.calls(), 0);
  }
});

test("caller APPROVED status without an injected trusted review remains UNKNOWN", async () => {
  const { fixture, snapshot } = catalogFixture();
  const authority = authorityReader();
  const catalog = catalogReader(snapshot);
  const projectRequest = request(fixture);
  const result = await buildProjectPossibleOptions(
    {
      authorityReader: authority.reader,
      catalogReader: catalog.reader,
      reviewAuthority: { findApproval: () => undefined },
    },
    projectRequest
  );
  assert.equal(result.paths[0].comparisons[0].outcome, "UNKNOWN");
  assert.ok(
    result.paths[0].comparisons[0].reasons.includes("REVIEW_APPROVAL_MISSING")
  );
  assert.equal(result.paths[0].comparisons[0].comparator, undefined);
});
