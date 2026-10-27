// biome-ignore-all lint/suspicious/noMisplacedAssertion: The helper assertions run only when called from a node:test case.
// biome-ignore-all lint/suspicious/useAwait: The memory store implements asynchronous persistence ports.
import assert from "node:assert/strict";
import test from "node:test";
import {
  type EducationCatalogQuery,
  EducationCatalogRepositoryCore,
  EducationCatalogRepositoryError,
  type EducationCatalogRowMap,
  type EducationCatalogStore,
  type EducationCatalogStoredRow,
  type EducationCatalogTable,
  type EducationCatalogTransaction,
} from "./catalog-repository-core";
import type { EducationFieldObservation, EducationSnapshot } from "./contracts";
import { validateEducationDataset } from "./contracts";
import { resolveEducationField } from "./field-resolution";
import { createSyntheticEducationFixture } from "./fixtures";
import { intakeExternalIdentityKey } from "./identity";

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
      throw new Error("Unexpected table.");
  }
}

function rowTarget(row: EducationCatalogRowMap["observations"]): {
  readonly type: string;
  readonly id: string | null;
} {
  if (row.targetType === "PROVIDER") {
    return { type: row.targetType, id: row.providerTargetId };
  }
  if (row.targetType === "COURSE") {
    return { type: row.targetType, id: row.courseTargetId };
  }
  if (row.targetType === "DELIVERY") {
    return { type: row.targetType, id: row.deliveryTargetId };
  }
  return { type: row.targetType, id: row.intakeTargetId };
}

class MemoryEducationCatalogStore implements EducationCatalogStore {
  rows = emptyRows();
  transactionCount = 0;
  insertCount = 0;

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
        this.insertCount += 1;
        return true;
      },
      findById: async <K extends EducationCatalogTable>(
        table: K,
        id: string
      ): Promise<EducationCatalogRowMap[K] | undefined> => {
        return working[table].find((row) => rowId(table, row) === id);
      },
      query: async (query) => queryRows(working, query),
    };
    const result = await operation(transaction);
    this.rows = working;
    return result;
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
        const target = rowTarget(row);
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
    case "observations_for_target_fields": {
      const keys = new Set(
        query.targetFields.map(
          ({ target, fieldKey }) =>
            `${target.type}\u0000${target.id}\u0000${fieldKey}`
        )
      );
      selected = rows.observations.filter((row) => {
        const target = rowTarget(row);
        return keys.has(
          `${target.type}\u0000${target.id}\u0000${row.fieldKey}`
        );
      });
      break;
    }
    default:
      throw new Error("Unexpected query.");
  }
  return selected.slice(0, query.limit);
}

function repository(store = new MemoryEducationCatalogStore()) {
  return { store, repository: new EducationCatalogRepositoryCore(store) };
}

function expectCatalogError(
  operation: () => Promise<unknown>,
  code: EducationCatalogRepositoryError["code"]
) {
  return assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof EducationCatalogRepositoryError);
    assert.equal(error.code, code);
    return true;
  });
}

test("ingestion is transactional, exact replay is idempotent, and target reads preserve resolver evidence", async () => {
  const fixture = createSyntheticEducationFixture("VET").dataset;
  const { store, repository: catalog } = repository();
  const first = await catalog.ingest(fixture);
  assert.equal(first.inserted.observations, fixture.observations.length);
  assert.equal(first.replayed.observations, 0);
  const replay = await catalog.ingest(fixture);
  assert.equal(replay.inserted.observations, 0);
  assert.equal(replay.replayed.observations, fixture.observations.length);

  const courseId = fixture.courses[0].courseId;
  const projection = await catalog.readTarget({ type: "COURSE", id: courseId });
  assert.deepEqual(projection.courses, fixture.courses);
  assert.deepEqual(
    projection.observations,
    fixture.observations.filter(
      (item) => item.target.type === "COURSE" && item.target.id === courseId
    )
  );
  assert.deepEqual(
    projection.snapshots.map((item) => item.snapshotId).sort(),
    fixture.snapshots
      .filter((item) =>
        projection.sources.some((source) => source.sourceId === item.sourceId)
      )
      .map((item) => item.snapshotId)
      .sort()
  );
  const sourceField = fixture.observations.find(
    (item) => item.fieldKey === "TUITION_FEE"
  ) as EducationFieldObservation;
  const resolution = resolveEducationField(
    projection,
    { type: "COURSE", id: courseId },
    "TUITION_FEE",
    { assessedAt: "2026-10-27T12:00:00.000Z", assessmentDate: "2026-10-27" }
  );
  assert.equal(resolution.status, "KNOWN");
  assert.equal(
    resolution.sourceRefs[0].observationId,
    sourceField.observationId
  );
  assert.equal(store.transactionCount, 3);
});

test("a changed immutable record rejects and rolls back earlier inserts in the same batch", async () => {
  const fixture = createSyntheticEducationFixture("VET").dataset;
  const { store, repository: catalog } = repository();
  await catalog.ingest(fixture);
  const observation = fixture.observations.find(
    (item) => item.value?.kind === "text"
  );
  assert.ok(observation);
  const changed = {
    ...fixture,
    providers: [
      ...fixture.providers,
      {
        providerId: "test-provider-rollback-probe",
        recordClass: "SYNTHETIC" as const,
        displayName: "Synthetic rollback probe",
      },
    ],
    observations: fixture.observations.map((item) =>
      item.observationId === observation.observationId
        ? {
            ...item,
            value:
              item.value?.kind === "text"
                ? { ...item.value, value: "mutated immutable value" }
                : item.value,
          }
        : item
    ),
  };
  await expectCatalogError(() => catalog.ingest(changed), "integrity_conflict");
  assert.equal(
    store.rows.providers.some(
      (row) => row.providerId === "test-provider-rollback-probe"
    ),
    false
  );
  assert.equal(
    store.rows.observations.find(
      (row) => row.observationId === observation.observationId
    )?.value &&
      JSON.stringify(
        store.rows.observations.find(
          (row) => row.observationId === observation.observationId
        )?.value
      ) === JSON.stringify(observation.value ?? null),
    true
  );
});

test("invalid cross-source evidence, mismatched target and RecordClass hierarchy fail before transaction", async () => {
  const fixture = createSyntheticEducationFixture("VET").dataset;
  const { store, repository: catalog } = repository();
  const firstObservation = fixture.observations[0];
  assert.ok(firstObservation);
  const alternateSource = fixture.sources.find(
    (source) => source.sourceId !== firstObservation.provenance.sourceId
  );
  assert.ok(alternateSource);
  const sourceMismatch = {
    ...fixture,
    observations: fixture.observations.map((item, index) =>
      index === 0
        ? {
            ...item,
            provenance: {
              ...item.provenance,
              sourceId: alternateSource.sourceId,
            },
          }
        : item
    ),
  };
  assert.ok(
    validateEducationDataset(sourceMismatch).issues.some(
      (issue) => issue.code === "CROSS_SOURCE_SNAPSHOT"
    )
  );
  await expectCatalogError(
    () => catalog.ingest(sourceMismatch),
    "invalid_dataset"
  );
  const targetMismatch = {
    ...fixture,
    observations: fixture.observations.map((item, index) =>
      index === 0
        ? { ...item, target: { type: "COURSE" as const, id: "missing-course" } }
        : item
    ),
  };
  await expectCatalogError(
    () => catalog.ingest(targetMismatch),
    "invalid_dataset"
  );
  const recordClassMismatch = {
    ...fixture,
    courses: fixture.courses.map((course, index) =>
      index === 0 ? { ...course, recordClass: "UNVERIFIED" as const } : course
    ),
  };
  await expectCatalogError(
    () => catalog.ingest(recordClassMismatch),
    "invalid_dataset"
  );
  assert.equal(store.transactionCount, 0);
});

test("ambiguous intake identity stays explicit while the same term code in different years survives", async () => {
  const fixture = structuredClone(
    createSyntheticEducationFixture("VET").dataset
  );
  const intake = fixture.intakes[0];
  const ambiguous = {
    ...fixture,
    intakes: [{ ...intake, year: undefined, startDate: undefined }],
  };
  const { store, repository: catalog } = repository();
  const ambiguousResult = intakeExternalIdentityKey(
    ambiguous.intakes[0],
    fixture.deliveries.find(
      (delivery) => delivery.deliveryId === ambiguous.intakes[0].deliveryId
    ) as (typeof fixture.deliveries)[number],
    fixture.courses[0]
  );
  assert.equal(ambiguousResult.status, "AMBIGUOUS");
  await catalog.ingest(ambiguous);
  assert.equal(store.rows.intakes.length, 1);
  assert.equal(store.rows.intakes[0]?.intakeId, intake.intakeId);

  const annualReuse = {
    ...fixture,
    intakes: [
      { ...intake, intakeCode: "TERM-1", term: "Semester 1" },
      {
        ...intake,
        intakeId: "test-intake-next-year",
        intakeCode: "TERM-1",
        term: "Semester 1",
        year: 2028,
        startDate: "2028-03-01",
      },
    ],
  };
  const separateStore = repository();
  const result = await separateStore.repository.ingest(annualReuse);
  assert.equal(result.inserted.intakes, 2);
  assert.equal(separateStore.store.rows.intakes.length, 2);
});

test("source-scope reads retain A-B-A snapshot history, failed attempts and competing-source evidence", async () => {
  const fixture = createSyntheticEducationFixture(
    "CONFLICTING_OFFICIAL_OBSERVATIONS"
  ).dataset;
  const source = fixture.sources.find(
    (row) => row.sourceFamily === "INSTITUTION"
  );
  assert.ok(source);
  const history = fixture.snapshots.filter(
    (row) => row.sourceId === source.sourceId
  );
  assert.equal(history.length, 1);
  const hashA = history[0].contentSha256 as string;
  const hashB = "b".repeat(64);
  const extraSnapshots = [
    {
      ...history[0],
      snapshotId: "snapshot-a-again",
      retrievedAt: "2026-10-28T00:00:00.000Z",
      observedAt: "2026-10-28T00:00:00.000Z",
      contentSha256: hashA,
    },
    {
      ...history[0],
      snapshotId: "snapshot-b",
      retrievedAt: "2026-10-29T00:00:00.000Z",
      observedAt: "2026-10-29T00:00:00.000Z",
      contentSha256: hashB,
    },
    {
      ...history[0],
      snapshotId: "snapshot-a-final",
      retrievedAt: "2026-10-30T00:00:00.000Z",
      observedAt: "2026-10-30T00:00:00.000Z",
      contentSha256: hashA,
    },
    {
      snapshotId: "snapshot-failed-fetch",
      sourceId: history[0].sourceId,
      recordClass: history[0].recordClass,
      sourceUrl: history[0].sourceUrl,
      retrievedAt: "2026-10-31T00:00:00.000Z",
      observedAt: "2026-10-31T00:00:00.000Z",
      acquisitionOutcome: "FAILED_FETCH" as const,
    },
  ];
  const capturedSnapshots = extraSnapshots.slice(
    0,
    3
  ) as readonly EducationSnapshot[];
  const aObservations = fixture.observations
    .filter((row) => row.provenance.sourceId === source.sourceId)
    .slice(0, 1)
    .flatMap((original) =>
      capturedSnapshots.map((snapshot, index) => ({
        ...original,
        observationId: `observation-history-${index}`,
        provenance: {
          ...original.provenance,
          snapshotId: snapshot.snapshotId,
          contentSha256: snapshot.contentSha256 as string,
        },
        observedAt: snapshot.observedAt,
      }))
    );
  const dataset = {
    ...fixture,
    snapshots: [...fixture.snapshots, ...extraSnapshots],
    observations: [...fixture.observations, ...aObservations],
  };
  const { repository: catalog } = repository();
  await catalog.ingest(dataset);
  const projection = await catalog.readSourceScope(source.sourceId);
  const sourceHistory = projection.snapshots
    .filter((row) => row.sourceId === source.sourceId)
    .sort((left, right) => left.retrievedAt.localeCompare(right.retrievedAt));
  assert.deepEqual(
    sourceHistory.slice(-4).map((row) => row.contentSha256),
    [hashA, hashB, hashA, undefined]
  );
  assert.equal(sourceHistory.at(-1)?.acquisitionOutcome, "FAILED_FETCH");
  assert.ok(
    projection.observations.some(
      (row) => row.provenance.sourceId !== source.sourceId
    ),
    "a source-scope read includes competing source observations for the same fields"
  );
});

test("source-scope projection preserves unknown fee and incompatible fee scopes", async () => {
  for (const name of [
    "MISSING_FEE_AND_DEADLINE",
    "INCOMPATIBLE_FEES",
  ] as const) {
    const fixture = createSyntheticEducationFixture(name).dataset;
    const source = fixture.sources.find(
      (row) => row.sourceFamily === "INSTITUTION"
    );
    assert.ok(source);
    const { repository: catalog } = repository();
    await catalog.ingest(fixture);
    const projection = await catalog.readSourceScope(source.sourceId);
    const courseId = fixture.courses[0].courseId;
    const resolution = resolveEducationField(
      projection,
      { type: "COURSE", id: courseId },
      "TUITION_FEE",
      { assessedAt: "2026-10-27T12:00:00.000Z", assessmentDate: "2026-10-27" }
    );
    assert.equal(resolution.status, "UNKNOWN");
    assert.deepEqual(
      resolution.reasons,
      name === "MISSING_FEE_AND_DEADLINE"
        ? ["NO_OBSERVATIONS"]
        : ["INCOMPATIBLE_FEE_SCOPE"]
    );
  }
});

test("bounded target reads fail explicitly instead of returning a truncated dataset", async () => {
  const fixture = createSyntheticEducationFixture("VET").dataset;
  const store = new MemoryEducationCatalogStore();
  const catalog = new EducationCatalogRepositoryCore(store, {
    entityRows: 250,
    sourceRows: 50,
    snapshotRows: 500,
    observationRows: 1,
  });
  await catalog.ingest(fixture);
  await expectCatalogError(
    () =>
      catalog.readTarget({
        type: "COURSE",
        id: fixture.courses[0].courseId,
      }),
    "read_bound_exceeded"
  );
});
