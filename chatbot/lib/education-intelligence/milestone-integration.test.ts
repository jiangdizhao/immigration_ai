// biome-ignore-all lint/suspicious/noMisplacedAssertion: Assertions inside these injected fakes execute only from the node:test cases.
// biome-ignore-all lint/suspicious/useAwait: The fakes implement Promise-based production ports.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { AuthorizedProjectFact } from "../projects/project-context";
import {
  type AcquisitionDnsResolver,
  type AcquisitionTransportResponse,
  acquireEducationSource,
  type CandidateExtractor,
  type PinnedAcquisitionTransport,
} from "./acquisition-core";
import {
  ACQUISITION_FIXTURE_TIME,
  createAcquisitionManifest as createManifest,
} from "./acquisition-fixtures";
import { buildEducationAcquisitionReviewPacket } from "./acquisition-review";
import type {
  EducationCatalogQuery,
  EducationCatalogRowMap,
  EducationCatalogStore,
  EducationCatalogStoredRow,
  EducationCatalogTable,
  EducationCatalogTransaction,
} from "./catalog-repository-core";
import {
  EducationCatalogRepositoryCore,
  EducationCatalogRepositoryError,
} from "./catalog-repository-core";
import type { EducationDataset, EducationFieldObservation } from "./contracts";
import { createSyntheticEducationFixture } from "./fixtures";
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
} from "./project-options";
import {
  buildEducationResolvedReadModel,
  type EducationCatalogReader,
  type EducationCatalogReadSnapshot,
} from "./read-model";

const ASSESSED_AT = "2026-10-27T12:00:00.000Z";
const ASSESSMENT_DATE = "2026-10-27";
const ACTOR = "synthetic-actor-001";
const PROJECT = "synthetic-project-001";
const CHAT = "synthetic-project-chat-001";
const PRIVATE_SENTINEL = "SYNTHETIC_PRIVATE_FACT_SENTINEL";
const BODY =
  "TEST_ONLY_SYNTHETIC: IELTS overall score minimum 6.5 for this example.";
const QUOTE = "IELTS overall score minimum 6.5";
const HOST = "example-school.institution.example";
const PEER_IP = "8.8.8.8";

type MemoryRows = {
  [K in EducationCatalogTable]: EducationCatalogRowMap[K][];
};

function emptyRows(): MemoryRows {
  return {
    providers: [],
    courses: [],
    deliveries: [],
    intakes: [],
    sources: [],
    snapshots: [],
    observations: [],
  };
}

function rowId(
  table: EducationCatalogTable,
  row: EducationCatalogStoredRow
): string {
  switch (table) {
    case "providers":
      return (row as EducationCatalogRowMap["providers"]).providerId;
    case "courses":
      return (row as EducationCatalogRowMap["courses"]).courseId;
    case "deliveries":
      return (row as EducationCatalogRowMap["deliveries"]).deliveryId;
    case "intakes":
      return (row as EducationCatalogRowMap["intakes"]).intakeId;
    case "sources":
      return (row as EducationCatalogRowMap["sources"]).sourceId;
    case "snapshots":
      return (row as EducationCatalogRowMap["snapshots"]).snapshotId;
    case "observations":
      return (row as EducationCatalogRowMap["observations"]).observationId;
    default:
      throw new Error("Unexpected catalog table.");
  }
}

function observationTarget(row: EducationCatalogRowMap["observations"]): {
  readonly type: string;
  readonly id: string | null;
} {
  switch (row.targetType) {
    case "PROVIDER":
      return { type: row.targetType, id: row.providerTargetId };
    case "COURSE":
      return { type: row.targetType, id: row.courseTargetId };
    case "DELIVERY":
      return { type: row.targetType, id: row.deliveryTargetId };
    case "INTAKE":
      return { type: row.targetType, id: row.intakeTargetId };
    default:
      throw new Error("Unexpected education observation target.");
  }
}

function queryRows(
  rows: MemoryRows,
  query: EducationCatalogQuery
): readonly EducationCatalogStoredRow[] {
  let selected: readonly EducationCatalogStoredRow[];
  switch (query.kind) {
    case "entity_ids":
      selected = rows[query.table].filter((row) =>
        query.ids.includes(rowId(query.table, row))
      );
      break;
    case "source_ids":
      selected = rows.sources.filter((row) => query.ids.includes(row.sourceId));
      break;
    case "snapshots_for_sources":
      selected = rows.snapshots.filter((row) =>
        query.sourceIds.includes(row.sourceId)
      );
      break;
    case "observations_for_target":
      selected = rows.observations.filter((row) => {
        const target = observationTarget(row);
        return (
          target.type === query.target.type && target.id === query.target.id
        );
      });
      break;
    case "observations_for_sources":
      selected = rows.observations.filter((row) =>
        query.sourceIds.includes(row.sourceId)
      );
      break;
    case "observations_for_target_fields":
      selected = rows.observations.filter((row) => {
        const target = observationTarget(row);
        return query.targetFields.some(
          (targetField) =>
            target.type === targetField.target.type &&
            target.id === targetField.target.id &&
            row.fieldKey === targetField.fieldKey
        );
      });
      break;
    default:
      throw new Error("Unexpected education catalog query.");
  }
  return selected.slice(0, query.limit);
}

/** A transactionally isolated test store implementing the actual repository port. */
class MemoryEducationCatalogStore implements EducationCatalogStore {
  rows = emptyRows();
  transactionCount = 0;
  revision = 0;

  async transaction<T>(
    operation: (transaction: EducationCatalogTransaction) => Promise<T>,
    _options?: { readonly consistentRead?: boolean }
  ): Promise<T> {
    this.transactionCount += 1;
    const working = structuredClone(this.rows);
    const transaction: EducationCatalogTransaction = {
      insertIfAbsent: async (table, row) => {
        const id = rowId(table, row as EducationCatalogStoredRow);
        if (working[table].some((existing) => rowId(table, existing) === id)) {
          return false;
        }
        working[table].push(structuredClone(row) as never);
        return true;
      },
      findById: async <K extends EducationCatalogTable>(
        table: K,
        id: string
      ): Promise<EducationCatalogRowMap[K] | undefined> =>
        working[table].find((row) => rowId(table, row) === id),
      query: async (query) => queryRows(working, query),
    };
    const result = await operation(transaction);
    this.rows = working;
    if (!_options?.consistentRead) {
      this.revision += 1;
    }
    return result;
  }
}

function mergeDataset(
  base: EducationDataset,
  additions: Partial<EducationDataset>
): EducationDataset {
  const mergeBy = <T>(
    left: readonly T[],
    right: readonly T[],
    id: (row: T) => string
  ): readonly T[] => {
    const result = [...left];
    const known = new Set(left.map(id));
    for (const row of right) {
      if (!known.has(id(row))) {
        known.add(id(row));
        result.push(row);
      }
    }
    return result;
  };
  return {
    providers: mergeBy(
      base.providers,
      additions.providers ?? [],
      (row) => row.providerId
    ),
    courses: mergeBy(
      base.courses,
      additions.courses ?? [],
      (row) => row.courseId
    ),
    deliveries: mergeBy(
      base.deliveries,
      additions.deliveries ?? [],
      (row) => row.deliveryId
    ),
    intakes: mergeBy(
      base.intakes,
      additions.intakes ?? [],
      (row) => row.intakeId
    ),
    sources: mergeBy(
      base.sources,
      additions.sources ?? [],
      (row) => row.sourceId
    ),
    snapshots: mergeBy(
      base.snapshots,
      additions.snapshots ?? [],
      (row) => row.snapshotId
    ),
    observations: mergeBy(
      base.observations,
      additions.observations ?? [],
      (row) => row.observationId
    ),
  };
}

function snapshotToken(dataset: EducationDataset): string {
  return createHash("sha256")
    .update(JSON.stringify(dataset), "utf8")
    .digest("hex");
}

function readerOverRepository(
  repository: EducationCatalogRepositoryCore,
  store: MemoryEducationCatalogStore
): EducationCatalogReader {
  return {
    async readConsistent(request): Promise<EducationCatalogReadSnapshot> {
      // This bridge intentionally accepts one exact course. Each result is one
      // EducationCatalogRepositoryCore consistent target read, not a mock list.
      if (request.courseIds.length !== 1) {
        return {
          consistency: "INCONSISTENT",
          snapshotToken: "rejected-multicourse-test-read",
          complete: false,
          courseSelections: request.courseIds.map((courseId) => ({
            courseId,
            status: "AMBIGUOUS" as const,
          })),
          dataset: emptyDataset(),
        };
      }
      const courseId = request.courseIds[0];
      const startingRevision = store.revision;
      const courseRead = await repository.readTarget({
        type: "COURSE",
        id: courseId,
      });
      if (!courseRead.courses.some((course) => course.courseId === courseId)) {
        return {
          consistency: "CONSISTENT",
          snapshotToken: "absent-course",
          complete: true,
          courseSelections: [{ courseId, status: "ABSENT" }],
          dataset: courseRead,
        };
      }
      const deliveryIds = store.rows.deliveries
        .filter((delivery) => delivery.courseId === courseId)
        .map((delivery) => delivery.deliveryId);
      const intakeIds = store.rows.intakes
        .filter((intake) => deliveryIds.includes(intake.deliveryId))
        .map((intake) => intake.intakeId);
      const branches = await Promise.all([
        ...deliveryIds.map((id) =>
          repository.readTarget({ type: "DELIVERY", id })
        ),
        ...intakeIds.map((id) => repository.readTarget({ type: "INTAKE", id })),
      ]);
      let dataset = courseRead;
      for (const branch of branches) {
        dataset = mergeDataset(dataset, branch);
      }
      const withinBounds =
        dataset.providers.length <= request.limits.entityRows &&
        dataset.courses.length <= request.limits.entityRows &&
        dataset.deliveries.length <= request.limits.entityRows &&
        dataset.intakes.length <= request.limits.entityRows &&
        dataset.sources.length <= request.limits.sourceRows &&
        dataset.snapshots.length <= request.limits.snapshotRows &&
        dataset.observations.length <= request.limits.observationRows &&
        startingRevision === store.revision;
      return {
        consistency: withinBounds ? "CONSISTENT" : "INCONSISTENT",
        snapshotToken: snapshotToken(dataset),
        complete: withinBounds,
        courseSelections: [
          {
            courseId,
            status: dataset.courses.some(
              (course) => course.courseId === courseId
            )
              ? "FOUND"
              : "ABSENT",
          },
        ],
        dataset,
      };
    },
  };
}

function emptyDataset(): EducationDataset {
  return {
    providers: [],
    courses: [],
    deliveries: [],
    intakes: [],
    sources: [],
    snapshots: [],
    observations: [],
  };
}

function syntheticInstitutionManifest(providerId: string) {
  const manifest = createManifest("INSTITUTION");
  const baseUrl = `https://${HOST}`;
  return {
    ...manifest,
    sourceId: "m3-005-integrated-institution-source",
    scope: { kind: "PROVIDER" as const, providerId },
    canonicalUrl: `${baseUrl}/course-information/synthetic-vet`,
    approvedHosts: [HOST],
    allowedPathPrefixes: ["/course-information"],
    syntheticFixture: true,
    authorityEvidence: {
      kind: "INSTITUTION_SITE" as const,
      title: "TEST_ONLY_SYNTHETIC institution source",
      referenceUrl: `${baseUrl}/authority`,
    },
    accessReview: {
      ...manifest.accessReview,
      terms: { assessment: "ALLOW" as const, evidenceUrl: `${baseUrl}/terms` },
      robots: {
        assessment: "ALLOW" as const,
        evidenceUrl: `${baseUrl}/robots.txt`,
      },
    },
  };
}

function fakeAcquisitionPorts(input: { body?: string } = {}) {
  const body = input.body ?? BODY;
  const calls = { dns: 0, transport: 0 };
  const resolver: AcquisitionDnsResolver = {
    async resolve(hostname) {
      calls.dns += 1;
      assert.equal(hostname, HOST);
      return [PEER_IP];
    },
  };
  const transport: PinnedAcquisitionTransport = {
    capabilities: {
      pinsResolvedAddress: true,
      validatesTlsHostname: true,
      followsRedirects: false,
      automaticDecompression: false,
    },
    async request(request): Promise<AcquisitionTransportResponse> {
      calls.transport += 1;
      assert.equal(request.hostname, HOST);
      assert.deepEqual(request.resolvedAddresses, [PEER_IP]);
      const encoded = new TextEncoder().encode(body);
      return {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-length": String(encoded.byteLength),
        },
        connectedAddress: PEER_IP,
        body: (async function* () {
          yield encoded;
        })(),
      };
    },
  };
  return { ports: { resolver, transport }, calls };
}

function admissionsExtractor(
  input: { quote?: string; value?: string } = {}
): CandidateExtractor {
  const quote = input.quote ?? QUOTE;
  return {
    mode: "DETERMINISTIC_RULES",
    parserVersion: "m3-005-synthetic-parser-v1",
    extract: () => [
      {
        target: { type: "COURSE", id: "test-course-vet" },
        fieldKey: "COURSE_ADMISSIONS_CRITERIA",
        value: {
          kind: "text",
          value: input.value ?? `TEST_ONLY_SYNTHETIC: ${quote}.`,
        },
        quote,
        locator: "/synthetic/course/admissions",
      },
    ],
  };
}

function fact(
  overrides: Partial<AuthorizedProjectFact> = {}
): AuthorizedProjectFact {
  return {
    assertionId: "synthetic-language-fact-v1",
    assertionVersion: 1,
    key: "language.testscore",
    valueType: "json",
    value: { value: 7, unit: "IELTS", privateMarker: PRIVATE_SENTINEL },
    originKind: "customer_stated",
    confirmedByUserId: ACTOR,
    effectiveFrom: null,
    effectiveTo: null,
    observedAt: "2026-10-26T00:00:00.000Z",
    sourceEvidenceRef: null,
    state: "customer_confirmed",
    stale: false,
    ...overrides,
  };
}

function authorizedContext(
  overrides: Partial<CurrentAuthorizedProjectOptionsContext> = {}
): CurrentAuthorizedProjectOptionsContext {
  return {
    actorUserId: ACTOR,
    projectId: PROJECT,
    chatId: CHAT,
    projectStatus: "ACTIVE",
    membershipStatus: "OWNER",
    chatStatus: "ACTIVE",
    chatOwnerUserId: ACTOR,
    chatProjectId: PROJECT,
    projectChatEnabled: true,
    projectContextEnabled: true,
    factsProjectionAvailable: true,
    accessRevision: "synthetic-access-1",
    projectRevision: "synthetic-project-revision-1",
    membershipRevision: "synthetic-membership-1",
    chatRevision: "synthetic-chat-1",
    factsProjectionRevision: "synthetic-facts-1",
    authorizedForAI: [fact()],
    ...overrides,
  };
}

function authorityReader(
  input: {
    first?: CurrentAuthorizedProjectOptionsContext;
    next?: (
      call: number,
      current: CurrentAuthorizedProjectOptionsContext
    ) => CurrentAuthorizedProjectOptionsContext;
  } = {}
): { reader: CurrentAuthorizedProjectOptionsReader; calls: () => number } {
  let count = 0;
  const base = input.first ?? authorizedContext();
  return {
    reader: {
      async readCurrentAuthorizedContext() {
        count += 1;
        return input.next?.(count, base) ?? base;
      },
    },
    calls: () => count,
  };
}

function criterionFor(
  observation: EducationFieldObservation,
  snapshot: EducationDataset["snapshots"][number],
  overrides: Partial<ReviewedEducationCriterion> = {}
): ReviewedEducationCriterion {
  return {
    criterionId: "m3-005-reviewed-synthetic-ielts-rule",
    schoolField: {
      target: observation.target,
      fieldKey: observation.fieldKey,
      observationId: observation.observationId,
      snapshotId: snapshot.snapshotId,
    },
    ruleEvidence: {
      observationId: observation.observationId,
      snapshotId: snapshot.snapshotId,
      sourceId: observation.provenance.sourceId,
      sourceFamily: observation.provenance.sourceFamily,
      sourceUrl: observation.provenance.sourceUrl,
      contentSha256: observation.provenance.contentSha256,
      locator: observation.provenance.locator,
      excerpt: observation.provenance.excerpt ?? "",
    },
    comparator: { kind: "NUMBER_MINIMUM", threshold: 6.5, unit: "IELTS" },
    applicantFact: {
      key: "language.testscore",
      valueType: "json",
      assertionId: "synthetic-language-fact-v1",
      assertionVersion: 1,
    },
    applicability: { status: "APPLIES" },
    review: {
      status: "APPROVED",
      reviewId: "synthetic-review-1",
      revision: "1",
    },
    ...overrides,
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
      reviewerId: "TEST_ONLY_SYNTHETIC_OPERATOR",
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

function optionRequest(
  courseId: string,
  criteria: readonly ReviewedEducationCriterion[]
) {
  return {
    actor: { authenticated: true as const, userId: ACTOR },
    projectId: PROJECT,
    chatId: CHAT,
    catalog: {
      courseIds: [courseId],
      assessedAt: ASSESSED_AT,
      assessmentDate: ASSESSMENT_DATE,
    },
    criteria,
  };
}

function rowCount(store: MemoryEducationCatalogStore): number {
  return Object.values(store.rows).reduce((sum, rows) => sum + rows.length, 0);
}

async function setupIntegratedFlow() {
  const originalFixture = createSyntheticEducationFixture("VET");
  // This integrated branch supplies the only admissions candidate from the
  // acquisition under test; it does not reuse the separate placeholder rule.
  const fixture = {
    ...originalFixture,
    dataset: {
      ...originalFixture.dataset,
      observations: originalFixture.dataset.observations.filter(
        (item) => item.fieldKey !== "COURSE_ADMISSIONS_CRITERIA"
      ),
    },
  };
  const courseId = fixture.dataset.courses[0].courseId;
  const providerId = fixture.dataset.providers[0].providerId;
  const store = new MemoryEducationCatalogStore();
  const repository = new EducationCatalogRepositoryCore(store);
  await repository.ingest(fixture.dataset);
  const baseDataset = await repository.readTarget({
    type: "COURSE",
    id: courseId,
  });
  const manifest = syntheticInstitutionManifest(providerId);
  const mock = fakeAcquisitionPorts();
  const attempt = await acquireEducationSource({
    attemptId: "m3-005-integrated-attempt-1",
    attemptedAt: ACQUISITION_FIXTURE_TIME,
    manifest,
    baseDataset,
    ports: mock.ports,
    extractor: admissionsExtractor(),
  });
  const review = buildEducationAcquisitionReviewPacket({
    attempt,
    baseDataset,
    assessedAt: ASSESSED_AT,
    requestedFields: [
      {
        target: { type: "COURSE", id: courseId },
        fieldKey: "COURSE_ADMISSIONS_CRITERIA",
      },
    ],
  });
  const candidateDataset = mergeDataset(baseDataset, {
    sources: attempt.source ? [attempt.source] : [],
    snapshots: attempt.snapshot ? [attempt.snapshot] : [],
    observations: attempt.candidateObservations,
  });
  return {
    fixture,
    courseId,
    providerId,
    store,
    repository,
    baseDataset,
    manifest,
    mock,
    attempt,
    review,
    candidateDataset,
  };
}

test("M3-005-INT-01 connects synthetic acquisition through repository, resolution, trusted review, and authorized options", async () => {
  const flow = await setupIntegratedFlow();
  assert.equal(flow.attempt.outcome, "CAPTURED");
  assert.equal(flow.mock.calls.dns, 1);
  assert.equal(flow.mock.calls.transport, 1);
  assert.equal(flow.attempt.source?.recordClass, "SYNTHETIC");
  assert.equal(flow.attempt.snapshot?.recordClass, "SYNTHETIC");
  assert.equal(flow.attempt.candidateObservations[0].recordClass, "SYNTHETIC");
  assert.equal(flow.attempt.snapshot?.sourceUrl, flow.manifest.canonicalUrl);
  assert.equal(
    flow.attempt.candidateObservations[0].provenance.contentSha256,
    flow.attempt.snapshot?.contentSha256
  );
  assert.equal(flow.attempt.candidateObservations[0].provenance.excerpt, QUOTE);
  assert.equal(flow.review.validation.ok, true);
  assert.equal(flow.review.writePreview.insertCount, 3);
  assert.equal(flow.review.fieldSignals[0].status, "CANDIDATES_PENDING_REVIEW");
  assert.deepEqual(flow.review.sideEffects, {
    networkRequestsByReview: 0,
    databaseWritesByReview: 0,
  });

  await flow.repository.ingest(flow.candidateDataset);
  const stored = await flow.repository.readTarget({
    type: "COURSE",
    id: flow.courseId,
  });
  const storedObservation = stored.observations.find(
    (item) =>
      item.observationId === flow.attempt.candidateObservations[0].observationId
  );
  assert.deepEqual(storedObservation, flow.attempt.candidateObservations[0]);
  assert.equal(
    stored.snapshots.find(
      (item) => item.snapshotId === flow.attempt.snapshot?.snapshotId
    )?.contentSha256,
    flow.attempt.snapshot?.contentSha256
  );

  const criterion = criterionFor(
    storedObservation as EducationFieldObservation,
    flow.attempt.snapshot as NonNullable<typeof flow.attempt.snapshot>
  );
  const authority = authorityReader();
  const catalogReader = readerOverRepository(flow.repository, flow.store);
  const request = optionRequest(flow.courseId, [criterion]);
  const dependencies = {
    authorityReader: authority.reader,
    catalogReader,
    reviewAuthority: trustedReviewAuthority([criterion]),
  };
  const result = await buildProjectPossibleOptions(dependencies, request);
  assert.equal(authority.calls(), 2);
  assert.equal(result.noEligibilitySignal, true);
  assert.equal(result.humanReviewRequired, true);
  assert.equal(result.paths.length, 1);
  assert.equal(
    result.paths[0].comparisons[0].outcome,
    "MATCHES",
    JSON.stringify(result.paths[0].comparisons[0])
  );
  assert.equal(
    result.paths[0].comparisons[0].schoolReference?.snapshotId,
    flow.attempt.snapshot?.snapshotId
  );
  assert.equal(
    result.paths[0].comparisons[0].schoolReference?.sourceId,
    flow.attempt.source?.sourceId
  );
  assert.equal(
    result.paths[0].path.fields.find(
      (field) => field.fieldKey === "COURSE_ADMISSIONS_CRITERIA"
    )?.sourceRefs[0].recordClass,
    "SYNTHETIC"
  );
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(PRIVATE_SENTINEL), false);
  assert.equal(serialized.includes("7"), true); // Outcome evidence is trace metadata, not the raw fact payload.
  assert.equal(result.paths[0].path.course.courseId, flow.courseId);
});

test("M3-005-INT-02 all five synthetic pathways retain exact provider/course identity and source authority roles", async () => {
  const pathways = [
    "ELICOS",
    "VET",
    "UNDERGRADUATE",
    "COURSEWORK_MASTERS",
    "RESEARCH",
  ] as const;
  for (const pathway of pathways) {
    const fixture = createSyntheticEducationFixture(pathway);
    assert.equal(fixture.marker, "TEST_ONLY_SYNTHETIC");
    const store = new MemoryEducationCatalogStore();
    const repository = new EducationCatalogRepositoryCore(store);
    await repository.ingest(fixture.dataset);
    const course = fixture.dataset.courses[0];
    const snapshot = await readerOverRepository(
      repository,
      store
    ).readConsistent({
      courseIds: [course.courseId],
      fieldKeysByEntityType: {
        PROVIDER: ["CRICOS_PROVIDER_STATUS"],
        COURSE: ["CRICOS_COURSE_STATUS", "DISCOVERY_REFERENCE"],
        DELIVERY: [],
        INTAKE: [],
      },
      limits: {
        courseSelectors: 1,
        entityRows: 20,
        sourceRows: 20,
        snapshotRows: 50,
        observationRows: 100,
        optionPaths: 20,
        outputBytes: 100_000,
        readerTimeoutMs: 1000,
      },
    });
    assert.equal(snapshot.consistency, "CONSISTENT", pathway);
    assert.equal(snapshot.complete, true, pathway);
    assert.equal(
      snapshot.dataset.courses[0].courseId,
      course.courseId,
      pathway
    );
    const readModel = await buildEducationResolvedReadModel(
      readerOverRepository(repository, store),
      {
        courseIds: [course.courseId],
        assessedAt: ASSESSED_AT,
        assessmentDate: ASSESSMENT_DATE,
      }
    );
    const path = readModel.paths.find(
      (item) => item.course.courseId === course.courseId
    );
    assert.ok(path, pathway);
    assert.equal(path?.course.provider.providerId, course.providerId, pathway);
    assert.equal(readModel.noPassSignal, true, pathway);
    assert.equal(path?.label, "Possible option for further review", pathway);
    const sourceRoles = new Set(
      path?.fields.flatMap((field) =>
        field.sourceRefs.map((ref) => ref.authorityRole)
      )
    );
    assert.equal(sourceRoles.has("CRICOS_REGISTRATION_ONLY"), true, pathway);
    assert.equal(sourceRoles.has("GOVERNMENT_DISCOVERY_ONLY"), true, pathway);
    assert.equal(
      sourceRoles.has("INSTITUTION_CLAIM_UNVERIFIED"),
      true,
      pathway
    );
  }

  const sameTitleFixture = createSyntheticEducationFixture(
    "AMBIGUOUS_COURSE_IDENTITIES"
  );
  const store = new MemoryEducationCatalogStore();
  const repository = new EducationCatalogRepositoryCore(store);
  await repository.ingest(sameTitleFixture.dataset);
  assert.equal(
    sameTitleFixture.dataset.courses[0].title,
    sameTitleFixture.dataset.courses[1].title
  );
  const readA = await repository.readTarget({
    type: "COURSE",
    id: sameTitleFixture.dataset.courses[0].courseId,
  });
  const readB = await repository.readTarget({
    type: "COURSE",
    id: sameTitleFixture.dataset.courses[1].courseId,
  });
  assert.equal(readA.courses.length, 1);
  assert.equal(readB.courses.length, 1);
  assert.notEqual(readA.courses[0].providerId, readB.courses[0].providerId);
});

test("M3-005-INT-09 delivery and intake branches keep scoped dates and deadlines separate", async () => {
  const fixture = createSyntheticEducationFixture(
    "MULTI_CAMPUS_MULTIPLE_INTAKES"
  );
  const store = new MemoryEducationCatalogStore();
  const repository = new EducationCatalogRepositoryCore(store);
  await repository.ingest(fixture.dataset);
  const courseId = fixture.dataset.courses[0].courseId;
  const readModel = await buildEducationResolvedReadModel(
    readerOverRepository(repository, store),
    {
      courseIds: [courseId],
      assessedAt: ASSESSED_AT,
      assessmentDate: ASSESSMENT_DATE,
    }
  );
  const intakePaths = readModel.paths.filter((path) => path.intake);
  assert.equal(intakePaths.length, 3);
  assert.equal(
    new Set(intakePaths.map((path) => path.delivery?.deliveryId)).size,
    2
  );
  assert.equal(
    new Set(intakePaths.map((path) => path.intake?.intakeId)).size,
    3
  );
  const deadlineStatuses = intakePaths.map((path) => ({
    intakeId: path.intake?.intakeId,
    status: path.fields.find(
      (field) =>
        field.target.type === "INTAKE" &&
        field.fieldKey === "APPLICATION_DEADLINE"
    )?.status,
  }));
  assert.equal(
    deadlineStatuses.filter((item) => item.status === "KNOWN").length,
    1
  );
  assert.equal(
    deadlineStatuses.filter((item) => item.status === "UNKNOWN").length,
    2
  );
});

test("M3-005-INT-03 exact acquisition replay is idempotent and changed immutable evidence fails with transaction rollback", async () => {
  const flow = await setupIntegratedFlow();
  await flow.repository.ingest(flow.candidateDataset);
  const persistedCount = rowCount(flow.store);
  const persisted = await flow.repository.readTarget({
    type: "COURSE",
    id: flow.courseId,
  });
  const replay = await acquireEducationSource({
    attemptId: flow.attempt.attemptId,
    attemptedAt: ACQUISITION_FIXTURE_TIME,
    manifest: flow.manifest,
    baseDataset: persisted,
    ports: fakeAcquisitionPorts().ports,
    extractor: admissionsExtractor(),
  });
  assert.equal(replay.outcome, "CAPTURED");
  assert.deepEqual(replay.snapshot, flow.attempt.snapshot);
  assert.deepEqual(
    replay.candidateObservations,
    flow.attempt.candidateObservations
  );
  const replayDataset = mergeDataset(persisted, {
    sources: replay.source ? [replay.source] : [],
    snapshots: replay.snapshot ? [replay.snapshot] : [],
    observations: replay.candidateObservations,
  });
  const replayResult = await flow.repository.ingest(replayDataset);
  assert.equal(replayResult.replayed.snapshots, persisted.snapshots.length);
  assert.equal(
    replayResult.replayed.observations,
    persisted.observations.length
  );
  assert.equal(rowCount(flow.store), persistedCount);

  const changed = await acquireEducationSource({
    attemptId: flow.attempt.attemptId,
    attemptedAt: ACQUISITION_FIXTURE_TIME,
    manifest: flow.manifest,
    baseDataset: persisted,
    ports: fakeAcquisitionPorts({ body: `${BODY} changed` }).ports,
    extractor: admissionsExtractor(),
  });
  assert.equal(changed.outcome, "BLOCKED");
  assert.equal(changed.diagnostic?.code, "IMMUTABLE_ID_CONFLICT");
  assert.equal(rowCount(flow.store), persistedCount);

  const changedObservation = {
    ...flow.attempt.candidateObservations[0],
    value: {
      kind: "text" as const,
      value: "TEST_ONLY_SYNTHETIC: altered rule.",
    },
  };
  const existingSource = flow.attempt.source;
  const existingSnapshot = flow.attempt.snapshot;
  assert.ok(existingSource && existingSnapshot);
  const addedSource = {
    ...existingSource,
    sourceId: "m3-005-rollback-extra-source",
    originalUrl: `https://${HOST}/course-information/extra`,
    canonicalUrl: `https://${HOST}/course-information/extra`,
  };
  const addedSnapshot = {
    ...existingSnapshot,
    snapshotId: "m3-005-rollback-extra-snapshot",
    sourceId: addedSource.sourceId,
    sourceUrl: addedSource.canonicalUrl,
    contentSha256: createHash("sha256")
      .update("TEST_ONLY_SYNTHETIC rollback")
      .digest("hex"),
    contentExcerpt: "TEST_ONLY_SYNTHETIC rollback",
  };
  const addedObservation = {
    ...flow.attempt.candidateObservations[0],
    observationId: "m3-005-rollback-extra-observation",
    provenance: {
      ...flow.attempt.candidateObservations[0].provenance,
      sourceId: addedSource.sourceId,
      snapshotId: addedSnapshot.snapshotId,
      sourceUrl: addedSnapshot.sourceUrl,
      contentSha256: addedSnapshot.contentSha256,
      locator: "/synthetic/rollback",
      excerpt: "TEST_ONLY_SYNTHETIC rollback",
    },
  };
  const conflictingBatch: EducationDataset = {
    ...persisted,
    sources: [...persisted.sources, addedSource],
    snapshots: [...persisted.snapshots, addedSnapshot],
    observations: [
      addedObservation,
      ...persisted.observations.map((item) =>
        item.observationId === changedObservation.observationId
          ? changedObservation
          : item
      ),
    ],
  };
  const before = rowCount(flow.store);
  await assert.rejects(
    flow.repository.ingest(conflictingBatch),
    (error: unknown) =>
      error instanceof EducationCatalogRepositoryError &&
      error.code === "integrity_conflict"
  );
  assert.equal(rowCount(flow.store), before);
});

test("M3-005-INT-04 fresh Project authorization is checked on both sides of catalog processing", async () => {
  const flow = await setupIntegratedFlow();
  await flow.repository.ingest(flow.candidateDataset);
  const stored = await flow.repository.readTarget({
    type: "COURSE",
    id: flow.courseId,
  });
  const observation = stored.observations.find(
    (item) =>
      item.observationId === flow.attempt.candidateObservations[0].observationId
  );
  assert.ok(observation);
  const snapshot = stored.snapshots.find(
    (item) => item.snapshotId === flow.attempt.snapshot?.snapshotId
  );
  assert.ok(snapshot);
  const criterion = criterionFor(
    observation as EducationFieldObservation,
    snapshot as NonNullable<typeof snapshot>
  );
  const criteria = [criterion];
  const authority = authorityReader({
    next: (call, current) =>
      call === 1
        ? current
        : authorizedContext({
            projectRevision: "synthetic-project-revision-changed",
            authorizedForAI: [
              fact({
                value: {
                  value: 7,
                  unit: "IELTS",
                  privateMarker: PRIVATE_SENTINEL,
                },
              }),
            ],
          }),
  });
  let catalogReads = 0;
  const underlying = readerOverRepository(flow.repository, flow.store);
  const catalogReader: EducationCatalogReader = {
    async readConsistent(request) {
      catalogReads += 1;
      return underlying.readConsistent(request);
    },
  };
  await assert.rejects(
    buildProjectPossibleOptions(
      {
        authorityReader: authority.reader,
        catalogReader,
        reviewAuthority: trustedReviewAuthority(criteria),
      },
      optionRequest(flow.courseId, criteria)
    ),
    (error: unknown) => {
      assert.equal(
        error instanceof Error ? error.message : "",
        "Project education options are unavailable."
      );
      assert.equal(JSON.stringify(error).includes(PRIVATE_SENTINEL), false);
      return true;
    }
  );
  assert.equal(authority.calls(), 2);
  assert.equal(catalogReads, 1);

  const denied = authorityReader({
    first: authorizedContext({ membershipStatus: "REVOKED" }),
  });
  let deniedCatalogReads = 0;
  await assert.rejects(
    buildProjectPossibleOptions(
      {
        authorityReader: denied.reader,
        catalogReader: {
          async readConsistent() {
            deniedCatalogReads += 1;
            throw new Error("should not read catalog");
          },
        },
        reviewAuthority: trustedReviewAuthority(criteria),
      },
      optionRequest(flow.courseId, criteria)
    ),
    { message: "Project education options are unavailable." }
  );
  assert.equal(denied.calls(), 1);
  assert.equal(deniedCatalogReads, 0);
});

test("M3-005-INT-05 incomplete catalog data and non-approved manifests fail closed before plausible output", async () => {
  const flow = await setupIntegratedFlow();
  await flow.repository.ingest(flow.candidateDataset);
  const stored = await flow.repository.readTarget({
    type: "COURSE",
    id: flow.courseId,
  });
  const observation = stored.observations.find(
    (item) =>
      item.observationId === flow.attempt.candidateObservations[0].observationId
  );
  const snapshot = stored.snapshots.find(
    (item) => item.snapshotId === flow.attempt.snapshot?.snapshotId
  );
  assert.ok(observation && snapshot);
  const criterion = criterionFor(observation, snapshot);
  const nonApprovedManifest = {
    ...flow.manifest,
    reviewState: "PROPOSED" as const,
    enabled: false,
  };
  const mock = fakeAcquisitionPorts();
  const blocked = await acquireEducationSource({
    attemptId: "m3-005-proposed-manifest-attempt",
    attemptedAt: ACQUISITION_FIXTURE_TIME,
    manifest: nonApprovedManifest,
    baseDataset: flow.baseDataset,
    ports: mock.ports,
    extractor: admissionsExtractor(),
  });
  assert.equal(blocked.outcome, "BLOCKED");
  assert.equal(blocked.diagnostic?.code, "SOURCE_NOT_APPROVED");
  assert.equal(mock.calls.dns, 0);
  assert.equal(mock.calls.transport, 0);

  const incompleteReader: EducationCatalogReader = {
    async readConsistent(request) {
      const actual = await readerOverRepository(
        flow.repository,
        flow.store
      ).readConsistent(request);
      return { ...actual, complete: false };
    },
  };
  const authority = authorityReader();
  await assert.rejects(
    buildProjectPossibleOptions(
      {
        authorityReader: authority.reader,
        catalogReader: incompleteReader,
        reviewAuthority: trustedReviewAuthority([criterion]),
      },
      optionRequest(flow.courseId, [criterion])
    ),
    { message: "Project education options are unavailable." }
  );
});

test("M3-005-INT-06 repository read resolves conflicting and missing fee/deadline evidence without entity defaults", async () => {
  for (const scenario of [
    "CONFLICTING_OFFICIAL_OBSERVATIONS",
    "INCOMPATIBLE_FEES",
    "MISSING_FEE_AND_DEADLINE",
  ] as const) {
    const fixture = createSyntheticEducationFixture(scenario);
    const store = new MemoryEducationCatalogStore();
    const repository = new EducationCatalogRepositoryCore(store);
    await repository.ingest(fixture.dataset);
    const courseId = fixture.dataset.courses[0].courseId;
    const result = await buildEducationResolvedReadModel(
      readerOverRepository(repository, store),
      {
        courseIds: [courseId],
        assessedAt: ASSESSED_AT,
        assessmentDate: ASSESSMENT_DATE,
      }
    );
    const fields = result.paths.flatMap((path) => path.fields);
    const fees = fields.filter((field) => field.fieldKey === "TUITION_FEE");
    if (scenario === "CONFLICTING_OFFICIAL_OBSERVATIONS") {
      assert.equal(
        fees.some((field) => field.status === "CONFLICTED"),
        true
      );
      assert.equal(
        fees.some((field) => field.sourceRefs.length >= 2),
        true
      );
    } else if (scenario === "INCOMPATIBLE_FEES") {
      assert.equal(
        fees.some(
          (field) =>
            field.status === "UNKNOWN" &&
            field.reasons.includes("INCOMPATIBLE_FEE_SCOPE")
        ),
        true
      );
    } else {
      assert.equal(
        fees.some((field) => field.status === "UNKNOWN"),
        true
      );
      assert.equal(
        fields.some(
          (field) =>
            field.fieldKey === "APPLICATION_DEADLINE" &&
            field.status === "UNKNOWN"
        ),
        true,
        JSON.stringify(
          fields.map((field) => [
            field.target.type,
            field.fieldKey,
            field.status,
            field.reasons,
          ])
        )
      );
      assert.equal(
        fields.some(
          (field) =>
            field.fieldKey === "INTAKE_START_DATE" && field.status === "KNOWN"
        ),
        true
      );
      const intake = result.paths.find((path) => path.intake)?.intake;
      assert.equal(
        intake && Object.hasOwn(intake, "applicationDeadline"),
        false
      );
    }
    assert.equal(result.noPassSignal, true);
  }
});

test("M3-005-INT-07 source history keeps distinct A-B-A captures and fails changed observation provenance closed", async () => {
  const flow = await setupIntegratedFlow();
  await flow.repository.ingest(flow.candidateDataset);
  const capture = async (
    attemptId: string,
    at: string,
    text: string,
    quote: string
  ) => {
    const base = await flow.repository.readTarget({
      type: "COURSE",
      id: flow.courseId,
    });
    const ports = fakeAcquisitionPorts({ body: text });
    const attempt = await acquireEducationSource({
      attemptId,
      attemptedAt: at,
      manifest: flow.manifest,
      baseDataset: base,
      ports: ports.ports,
      extractor: admissionsExtractor({
        quote,
        value: `TEST_ONLY_SYNTHETIC ${quote}`,
      }),
    });
    assert.equal(attempt.outcome, "CAPTURED");
    await flow.repository.ingest(
      mergeDataset(base, {
        sources: attempt.source ? [attempt.source] : [],
        snapshots: attempt.snapshot ? [attempt.snapshot] : [],
        observations: attempt.candidateObservations,
      })
    );
    return attempt;
  };
  const a = await capture(
    "m3-005-history-a",
    "2026-10-27T13:00:00.000Z",
    "TEST_ONLY_SYNTHETIC: IELTS minimum 6.5.",
    "IELTS minimum 6.5"
  );
  const b = await capture(
    "m3-005-history-b",
    "2026-10-27T14:00:00.000Z",
    "TEST_ONLY_SYNTHETIC: IELTS minimum 7.0.",
    "IELTS minimum 7.0"
  );
  const aAgain = await capture(
    "m3-005-history-a-again",
    "2026-10-27T15:00:00.000Z",
    "TEST_ONLY_SYNTHETIC: IELTS minimum 6.5.",
    "IELTS minimum 6.5"
  );
  assert.notEqual(a.snapshot?.snapshotId, b.snapshot?.snapshotId);
  assert.notEqual(b.snapshot?.snapshotId, aAgain.snapshot?.snapshotId);
  assert.equal(a.snapshot?.contentSha256, aAgain.snapshot?.contentSha256);
  const history = await flow.repository.readTarget({
    type: "COURSE",
    id: flow.courseId,
  });
  const snapshots = history.snapshots.filter(
    (item) => item.sourceId === flow.manifest.sourceId
  );
  const observations = history.observations.filter(
    (item) => item.provenance.sourceId === flow.manifest.sourceId
  );
  assert.deepEqual(
    new Set(snapshots.map((item) => item.snapshotId)).size,
    snapshots.length
  );
  assert.equal(snapshots.length, 4); // Initial connected capture plus A, B, A.
  assert.equal(observations.length, 4);
  assert.equal(
    observations.some(
      (item) => item.provenance.snapshotId === b.snapshot?.snapshotId
    ),
    true
  );
  assert.equal(
    observations.some(
      (item) => item.provenance.snapshotId === aAgain.snapshot?.snapshotId
    ),
    true
  );

  const persistedCount = rowCount(flow.store);
  const altered = {
    ...aAgain.candidateObservations[0],
    provenance: {
      ...aAgain.candidateObservations[0].provenance,
      excerpt: "changed provenance excerpt",
    },
  };
  const current = await flow.repository.readTarget({
    type: "COURSE",
    id: flow.courseId,
  });
  await assert.rejects(
    flow.repository.ingest({
      ...current,
      observations: current.observations.map((item) =>
        item.observationId === altered.observationId ? altered : item
      ),
    }),
    (error: unknown) =>
      error instanceof EducationCatalogRepositoryError &&
      error.code === "integrity_conflict"
  );
  assert.equal(rowCount(flow.store), persistedCount);
});

test("M3-005-INT-08 identical offline integration replay is byte-stable for fixed evidence and authorization revisions", async () => {
  const flow = await setupIntegratedFlow();
  await flow.repository.ingest(flow.candidateDataset);
  const stored = await flow.repository.readTarget({
    type: "COURSE",
    id: flow.courseId,
  });
  const observation = stored.observations.find(
    (item) =>
      item.observationId === flow.attempt.candidateObservations[0].observationId
  );
  const snapshot = stored.snapshots.find(
    (item) => item.snapshotId === flow.attempt.snapshot?.snapshotId
  );
  assert.ok(observation && snapshot);
  const criterion = criterionFor(observation, snapshot);
  const criteria = [criterion];
  const authority = authorityReader();
  const deps = {
    authorityReader: authority.reader,
    catalogReader: readerOverRepository(flow.repository, flow.store),
    reviewAuthority: trustedReviewAuthority(criteria),
  };
  const request = optionRequest(flow.courseId, criteria);
  const first = await buildProjectPossibleOptions(deps, request);
  const second = await buildProjectPossibleOptions(deps, request);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});
