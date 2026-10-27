import type {
  EducationCourseRow,
  EducationDeliveryRow,
  EducationFieldObservationRow,
  EducationIntakeRow,
  EducationProviderRow,
  EducationSnapshotRow,
  EducationSourceRow,
} from "@/lib/db/schema";
import {
  type EducationCourse,
  type EducationDataset,
  type EducationDelivery,
  type EducationEntityType,
  type EducationFieldObservation,
  type EducationIntake,
  type EducationProvider,
  type EducationSnapshot,
  type EducationSource,
  MAX_ENTITY_RECORDS,
  MAX_FIELD_OBSERVATIONS,
  MAX_SNAPSHOT_RECORDS,
  MAX_SOURCE_RECORDS,
  validateEducationDataset,
} from "./contracts";

export interface EducationCatalogRowMap {
  readonly providers: EducationProviderRow;
  readonly courses: EducationCourseRow;
  readonly deliveries: EducationDeliveryRow;
  readonly intakes: EducationIntakeRow;
  readonly sources: EducationSourceRow;
  readonly snapshots: EducationSnapshotRow;
  readonly observations: EducationFieldObservationRow;
}

export type EducationCatalogTable = keyof EducationCatalogRowMap;
export type EducationCatalogEntityTable =
  | "providers"
  | "courses"
  | "deliveries"
  | "intakes";

export type EducationCatalogQuery =
  | {
      readonly kind: "entity_ids";
      readonly table: EducationCatalogEntityTable;
      readonly ids: readonly string[];
      readonly limit: number;
    }
  | {
      readonly kind: "source_ids";
      readonly ids: readonly string[];
      readonly limit: number;
    }
  | {
      readonly kind: "snapshots_for_sources";
      readonly sourceIds: readonly string[];
      readonly limit: number;
    }
  | {
      readonly kind: "observations_for_target";
      readonly target: EducationCatalogTarget;
      readonly limit: number;
    }
  | {
      readonly kind: "observations_for_sources";
      readonly sourceIds: readonly string[];
      readonly limit: number;
    }
  | {
      readonly kind: "observations_for_target_fields";
      readonly targetFields: readonly EducationCatalogTargetField[];
      readonly limit: number;
    };

export interface EducationCatalogTarget {
  readonly type: EducationEntityType;
  readonly id: string;
}

export interface EducationCatalogTargetField {
  readonly target: EducationCatalogTarget;
  readonly fieldKey: EducationFieldObservation["fieldKey"];
}

export type EducationCatalogStoredRow =
  EducationCatalogRowMap[EducationCatalogTable];

export interface EducationCatalogTransaction {
  insertIfAbsent<K extends EducationCatalogTable>(
    table: K,
    row: EducationCatalogRowMap[K]
  ): Promise<boolean>;
  findById<K extends EducationCatalogTable>(
    table: K,
    id: string
  ): Promise<EducationCatalogRowMap[K] | undefined>;
  query(
    query: EducationCatalogQuery
  ): Promise<readonly EducationCatalogStoredRow[]>;
}

export interface EducationCatalogStore {
  transaction<T>(
    operation: (transaction: EducationCatalogTransaction) => Promise<T>,
    options?: { readonly consistentRead?: boolean }
  ): Promise<T>;
}

export interface EducationCatalogReadBounds {
  readonly entityRows: number;
  readonly sourceRows: number;
  readonly snapshotRows: number;
  readonly observationRows: number;
}

export const DEFAULT_EDUCATION_CATALOG_READ_BOUNDS: EducationCatalogReadBounds =
  {
    entityRows: 250,
    sourceRows: 50,
    snapshotRows: 500,
    observationRows: 1000,
  };

export class EducationCatalogRepositoryError extends Error {
  readonly code:
    | "invalid_dataset"
    | "integrity_conflict"
    | "read_bound_exceeded"
    | "missing_entity"
    | "inconsistent_storage";
  readonly details: readonly string[];

  constructor(
    code: EducationCatalogRepositoryError["code"],
    message: string,
    details: readonly string[] = []
  ) {
    super(message);
    this.name = "EducationCatalogRepositoryError";
    this.code = code;
    this.details = details;
  }
}

export interface EducationCatalogIngestResult {
  readonly inserted: Readonly<Record<EducationCatalogTable, number>>;
  readonly replayed: Readonly<Record<EducationCatalogTable, number>>;
}

function fail(
  code: EducationCatalogRepositoryError["code"],
  message: string,
  details: readonly string[] = []
): never {
  throw new EducationCatalogRepositoryError(code, message, details);
}

function canonicalValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)])
    );
  }
  return value;
}

function rowsEqual(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(canonicalValue(left)) ===
    JSON.stringify(canonicalValue(right))
  );
}

function idFor(
  table: EducationCatalogTable,
  row: EducationCatalogStoredRow
): string {
  switch (table) {
    case "providers":
      return (row as EducationProviderRow).providerId;
    case "courses":
      return (row as EducationCourseRow).courseId;
    case "deliveries":
      return (row as EducationDeliveryRow).deliveryId;
    case "intakes":
      return (row as EducationIntakeRow).intakeId;
    case "sources":
      return (row as EducationSourceRow).sourceId;
    case "snapshots":
      return (row as EducationSnapshotRow).snapshotId;
    case "observations":
      return (row as EducationFieldObservationRow).observationId;
    default:
      return fail(
        "inconsistent_storage",
        `Unknown catalog table ${String(table)}.`
      );
  }
}

function mapDatasetRows(dataset: EducationDataset): {
  readonly providers: readonly EducationProviderRow[];
  readonly courses: readonly EducationCourseRow[];
  readonly deliveries: readonly EducationDeliveryRow[];
  readonly intakes: readonly EducationIntakeRow[];
  readonly sources: readonly EducationSourceRow[];
  readonly snapshots: readonly EducationSnapshotRow[];
  readonly observations: readonly EducationFieldObservationRow[];
} {
  const courseById = new Map(dataset.courses.map((row) => [row.courseId, row]));
  const deliveryById = new Map(
    dataset.deliveries.map((row) => [row.deliveryId, row])
  );
  const sourceById = new Map(dataset.sources.map((row) => [row.sourceId, row]));
  const snapshotById = new Map(
    dataset.snapshots.map((row) => [row.snapshotId, row])
  );
  const providers = dataset.providers.map((provider) => ({
    providerId: provider.providerId,
    recordClass: provider.recordClass,
    displayName: provider.displayName,
    legalName: provider.legalName ?? null,
    aliases: provider.aliases ?? null,
    cricosProviderCode: provider.cricosProviderCode ?? null,
    category: provider.category ?? null,
  })) satisfies readonly EducationProviderRow[];
  const courses = dataset.courses.map((course) => ({
    courseId: course.courseId,
    providerId: course.providerId,
    recordClass: course.recordClass,
    title: course.title,
    qualificationLevel: course.qualificationLevel ?? null,
    sector: course.sector ?? null,
    cricosCourseCode: course.cricosCourseCode ?? null,
    institutionCourseCode: course.institutionCourseCode ?? null,
    studyField: course.studyField ?? null,
  })) satisfies readonly EducationCourseRow[];
  const deliveries = dataset.deliveries.map((delivery) => {
    const course = courseById.get(delivery.courseId);
    if (!course) {
      fail("inconsistent_storage", `Missing course ${delivery.courseId}.`);
    }
    return {
      deliveryId: delivery.deliveryId,
      courseId: delivery.courseId,
      providerId: course.providerId,
      recordClass: delivery.recordClass,
      campusId: delivery.campusId ?? null,
      siteId: delivery.siteId ?? null,
      campusName: delivery.campusName ?? null,
      city: delivery.city ?? null,
      state: delivery.state ?? null,
      mode: delivery.mode ?? null,
    };
  }) satisfies readonly EducationDeliveryRow[];
  const intakes = dataset.intakes.map((intake) => {
    const delivery = deliveryById.get(intake.deliveryId);
    if (!delivery) {
      fail("inconsistent_storage", `Missing delivery ${intake.deliveryId}.`);
    }
    const course = courseById.get(delivery.courseId);
    if (!course) {
      fail("inconsistent_storage", `Missing course ${delivery.courseId}.`);
    }
    return {
      intakeId: intake.intakeId,
      deliveryId: intake.deliveryId,
      providerId: course.providerId,
      recordClass: intake.recordClass,
      intakeCode: intake.intakeCode ?? null,
      term: intake.term ?? null,
      year: intake.year ?? null,
      startDate: intake.startDate ?? null,
      applicationDeadline: intake.applicationDeadline ?? null,
    };
  }) satisfies readonly EducationIntakeRow[];
  const sources = dataset.sources.map((source) => ({
    sourceId: source.sourceId,
    sourceFamily: source.sourceFamily,
    recordClass: source.recordClass,
    authorityName: source.authorityName,
    originalUrl: source.originalUrl,
    canonicalUrl: source.canonicalUrl,
    scopeKind: source.scope.kind,
    providerId:
      source.scope.kind === "PROVIDER" ? source.scope.providerId : null,
    scopeKey: source.scope.kind === "PROVIDER" ? source.scope.providerId : "",
    language: source.language,
    accessMode: source.accessMode,
  })) satisfies readonly EducationSourceRow[];
  const snapshots = dataset.snapshots.map((snapshot) => ({
    snapshotId: snapshot.snapshotId,
    sourceId: snapshot.sourceId,
    recordClass: snapshot.recordClass,
    sourceUrl: snapshot.sourceUrl,
    retrievedAt: snapshot.retrievedAt,
    observedAt: snapshot.observedAt,
    publishedAt: snapshot.publishedAt ?? null,
    effectiveFrom: snapshot.effectiveFrom ?? null,
    effectiveTo: snapshot.effectiveTo ?? null,
    contentSha256: snapshot.contentSha256 ?? null,
    parserVersion: snapshot.parserVersion ?? null,
    contentExcerpt: snapshot.contentExcerpt ?? null,
    locator: snapshot.locator ?? null,
    acquisitionOutcome: snapshot.acquisitionOutcome,
  })) satisfies readonly EducationSnapshotRow[];
  const observations = dataset.observations.map((observation) => {
    const source = sourceById.get(observation.provenance.sourceId);
    const snapshot = snapshotById.get(observation.provenance.snapshotId);
    if (!source || !snapshot) {
      fail(
        "inconsistent_storage",
        `Missing observation provenance ${observation.observationId}.`
      );
    }
    const targetProviderId =
      observation.target.type === "PROVIDER"
        ? observation.target.id
        : observation.target.type === "COURSE"
          ? courseById.get(observation.target.id)?.providerId
          : observation.target.type === "DELIVERY"
            ? (() => {
                const delivery = deliveryById.get(observation.target.id);
                return delivery
                  ? courseById.get(delivery.courseId)?.providerId
                  : undefined;
              })()
            : (() => {
                const intake = dataset.intakes.find(
                  (item) => item.intakeId === observation.target.id
                );
                const delivery = intake
                  ? deliveryById.get(intake.deliveryId)
                  : undefined;
                return delivery
                  ? courseById.get(delivery.courseId)?.providerId
                  : undefined;
              })();
    if (!targetProviderId) {
      fail(
        "inconsistent_storage",
        `Missing observation target ${observation.target.id}.`
      );
    }
    return {
      observationId: observation.observationId,
      targetType: observation.target.type,
      targetProviderId,
      providerTargetId:
        observation.target.type === "PROVIDER" ? observation.target.id : null,
      courseTargetId:
        observation.target.type === "COURSE" ? observation.target.id : null,
      deliveryTargetId:
        observation.target.type === "DELIVERY" ? observation.target.id : null,
      intakeTargetId:
        observation.target.type === "INTAKE" ? observation.target.id : null,
      fieldKey: observation.fieldKey,
      claimDomain: observation.claimDomain,
      recordClass: observation.recordClass,
      disposition: observation.disposition,
      value: observation.value ?? null,
      sourceId: source.sourceId,
      sourceFamily: source.sourceFamily,
      sourceScopeKind: source.scope.kind,
      sourceScopeKey:
        source.scope.kind === "PROVIDER" ? source.scope.providerId : "",
      snapshotId: snapshot.snapshotId,
      snapshotOutcome: snapshot.acquisitionOutcome,
      sourceUrl: observation.provenance.sourceUrl,
      contentSha256: observation.provenance.contentSha256,
      locator: observation.provenance.locator,
      excerpt: observation.provenance.excerpt ?? null,
      observedAt: observation.observedAt,
      effectiveFrom: observation.effectiveFrom ?? null,
      effectiveTo: observation.effectiveTo ?? null,
    };
  }) satisfies readonly EducationFieldObservationRow[];
  return {
    providers,
    courses,
    deliveries,
    intakes,
    sources,
    snapshots,
    observations,
  };
}

function targetFromObservation(
  row: EducationFieldObservationRow
): EducationCatalogTarget {
  const id =
    row.targetType === "PROVIDER"
      ? row.providerTargetId
      : row.targetType === "COURSE"
        ? row.courseTargetId
        : row.targetType === "DELIVERY"
          ? row.deliveryTargetId
          : row.intakeTargetId;
  if (!id) {
    fail(
      "inconsistent_storage",
      `Observation ${row.observationId} has no target ID.`
    );
  }
  return { type: row.targetType, id };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function uniqueTargets(
  values: readonly EducationCatalogTarget[]
): EducationCatalogTarget[] {
  const byKey = new Map(
    values.map((item) => [`${item.type}\u0000${item.id}`, item])
  );
  return [...byKey.values()];
}

function exactRows<T extends EducationCatalogTable>(
  rows: readonly EducationCatalogStoredRow[],
  _table: T
): EducationCatalogRowMap[T][] {
  return rows as EducationCatalogRowMap[T][];
}

function assertWithinBound<T>(
  rows: readonly T[],
  limit: number,
  label: string
): readonly T[] {
  if (rows.length > limit) {
    fail(
      "read_bound_exceeded",
      `Education catalog ${label} exceeds the read bound.`
    );
  }
  return rows;
}

export class EducationCatalogRepositoryCore {
  private readonly store: EducationCatalogStore;
  private readonly bounds: EducationCatalogReadBounds;

  constructor(
    store: EducationCatalogStore,
    bounds: EducationCatalogReadBounds = DEFAULT_EDUCATION_CATALOG_READ_BOUNDS
  ) {
    this.store = store;
    this.bounds = bounds;
    this.validateBounds(bounds);
  }

  private validateBounds(bounds: EducationCatalogReadBounds): void {
    const maxima: EducationCatalogReadBounds = {
      entityRows: MAX_ENTITY_RECORDS,
      sourceRows: MAX_SOURCE_RECORDS,
      snapshotRows: MAX_SNAPSHOT_RECORDS,
      observationRows: MAX_FIELD_OBSERVATIONS,
    };
    for (const key of Object.keys(
      maxima
    ) as (keyof EducationCatalogReadBounds)[]) {
      const value = bounds[key];
      if (!Number.isInteger(value) || value < 1 || value > maxima[key]) {
        fail(
          "invalid_dataset",
          `Invalid Education catalog read bound: ${key}.`
        );
      }
    }
  }

  // biome-ignore lint/suspicious/useAwait: Keep validation failures as promise rejections like persistence failures.
  async ingest(
    dataset: EducationDataset
  ): Promise<EducationCatalogIngestResult> {
    const validation = validateEducationDataset(dataset);
    if (!validation.ok) {
      fail(
        "invalid_dataset",
        "Education dataset failed contract validation.",
        validation.issues.map((issue) => `${issue.code}:${issue.path}`)
      );
    }
    const rows = mapDatasetRows(dataset);
    const inserted: Record<EducationCatalogTable, number> = {
      providers: 0,
      courses: 0,
      deliveries: 0,
      intakes: 0,
      sources: 0,
      snapshots: 0,
      observations: 0,
    };
    const replayed = { ...inserted };
    return this.store.transaction(async (transaction) => {
      for (const table of [
        "providers",
        "courses",
        "deliveries",
        "intakes",
        "sources",
        "snapshots",
        "observations",
      ] as const) {
        for (const row of rows[table]) {
          const id = idFor(table, row as EducationCatalogStoredRow);
          const created = await transaction.insertIfAbsent(table, row);
          if (created) {
            inserted[table] += 1;
            continue;
          }
          const existing = await transaction.findById(table, id);
          if (!existing) {
            fail(
              "integrity_conflict",
              `Education catalog identity collision for ${table}:${id}.`
            );
          }
          if (!rowsEqual(existing, row)) {
            fail(
              "integrity_conflict",
              `Immutable Education catalog record changed for ${table}:${id}.`
            );
          }
          replayed[table] += 1;
        }
      }
      return { inserted, replayed };
    });
  }

  readTarget(target: EducationCatalogTarget): Promise<EducationDataset> {
    return this.store.transaction(
      async (transaction) => {
        const rows = await transaction.query({
          kind: "observations_for_target",
          target,
          limit: this.bounds.observationRows + 1,
        });
        const observations = assertWithinBound(
          exactRows(rows, "observations"),
          this.bounds.observationRows,
          "target observations"
        );
        const roots = uniqueTargets([
          target,
          ...observations.map(targetFromObservation),
        ]);
        return this.reconstruct(transaction, roots, [], observations);
      },
      { consistentRead: true }
    );
  }

  readSourceScope(sourceId: string): Promise<EducationDataset> {
    return this.store.transaction(
      async (transaction) => {
        const sourceRows = await transaction.query({
          kind: "source_ids",
          ids: [sourceId],
          limit: this.bounds.sourceRows + 1,
        });
        const [source] = assertWithinBound(
          exactRows(sourceRows, "sources"),
          this.bounds.sourceRows,
          "source scope"
        );
        if (!source) {
          fail(
            "missing_entity",
            `Education source ${sourceId} does not exist.`
          );
        }
        const sourceObservationRows = await transaction.query({
          kind: "observations_for_sources",
          sourceIds: [sourceId],
          limit: this.bounds.observationRows + 1,
        });
        const sourceObservations = assertWithinBound(
          exactRows(sourceObservationRows, "observations"),
          this.bounds.observationRows,
          "source observations"
        );
        const targetFields = uniqueTargets(
          sourceObservations.map(targetFromObservation)
        ).flatMap((target) =>
          sourceObservations
            .filter((row) => {
              const rowTarget = targetFromObservation(row);
              return (
                rowTarget.type === target.type && rowTarget.id === target.id
              );
            })
            .map((row) => ({ target, fieldKey: row.fieldKey }))
        );
        const competingRows = targetFields.length
          ? await transaction.query({
              kind: "observations_for_target_fields",
              targetFields,
              limit: this.bounds.observationRows + 1,
            })
          : [];
        const observations = assertWithinBound(
          exactRows(competingRows, "observations"),
          this.bounds.observationRows,
          "source-scope observations"
        );
        const roots = uniqueTargets(observations.map(targetFromObservation));
        const providerRoots =
          source.scopeKind === "PROVIDER" && source.providerId
            ? [source.providerId]
            : [];
        return this.reconstruct(
          transaction,
          roots,
          [sourceId],
          observations,
          providerRoots
        );
      },
      { consistentRead: true }
    );
  }

  private async reconstruct(
    transaction: EducationCatalogTransaction,
    roots: readonly EducationCatalogTarget[],
    additionalSourceIds: readonly string[],
    observationRows: readonly EducationFieldObservationRow[],
    additionalProviderIds: readonly string[] = []
  ): Promise<EducationDataset> {
    const sourceIds = unique([
      ...additionalSourceIds,
      ...observationRows.map((row) => row.sourceId),
    ]);
    const sourceRows = sourceIds.length
      ? exactRows(
          await transaction.query({
            kind: "source_ids",
            ids: sourceIds,
            limit: this.bounds.sourceRows + 1,
          }),
          "sources"
        )
      : [];
    assertWithinBound(sourceRows, this.bounds.sourceRows, "sources");
    if (sourceRows.length !== sourceIds.length) {
      fail(
        "inconsistent_storage",
        "An observation refers to a missing source record."
      );
    }
    const snapshotRows = sourceIds.length
      ? exactRows(
          await transaction.query({
            kind: "snapshots_for_sources",
            sourceIds,
            limit: this.bounds.snapshotRows + 1,
          }),
          "snapshots"
        )
      : [];
    assertWithinBound(snapshotRows, this.bounds.snapshotRows, "snapshots");
    const snapshotIds = new Set(snapshotRows.map((row) => row.snapshotId));
    if (observationRows.some((row) => !snapshotIds.has(row.snapshotId))) {
      fail(
        "inconsistent_storage",
        "An observation refers to a missing source snapshot."
      );
    }
    const entityRows = await this.loadEntityGraph(
      transaction,
      roots,
      unique([
        ...additionalProviderIds,
        ...observationRows.map((row) => row.targetProviderId),
        ...sourceRows
          .map((row) => row.providerId)
          .filter((id): id is string => id !== null),
      ])
    );
    const dataset = datasetFromRows({
      ...entityRows,
      sources: sourceRows,
      snapshots: snapshotRows,
      observations: observationRows,
    });
    const validation = validateEducationDataset(dataset);
    if (!validation.ok) {
      fail(
        "inconsistent_storage",
        "Education catalog read projection is not a complete M3 dataset.",
        validation.issues.map((issue) => `${issue.code}:${issue.path}`)
      );
    }
    return dataset;
  }

  private async loadEntityGraph(
    transaction: EducationCatalogTransaction,
    roots: readonly EducationCatalogTarget[],
    providerIds: readonly string[]
  ): Promise<{
    readonly providers: readonly EducationProviderRow[];
    readonly courses: readonly EducationCourseRow[];
    readonly deliveries: readonly EducationDeliveryRow[];
    readonly intakes: readonly EducationIntakeRow[];
  }> {
    const intakeIds = unique([
      ...roots.filter((root) => root.type === "INTAKE").map((root) => root.id),
    ]);
    const intakes = await this.queryEntities(transaction, "intakes", intakeIds);
    const deliveryIds = unique([
      ...roots
        .filter((root) => root.type === "DELIVERY")
        .map((root) => root.id),
      ...intakes.map((row) => row.deliveryId),
    ]);
    const deliveries = await this.queryEntities(
      transaction,
      "deliveries",
      deliveryIds
    );
    const courseIds = unique([
      ...roots.filter((root) => root.type === "COURSE").map((root) => root.id),
      ...deliveries.map((row) => row.courseId),
    ]);
    const courses = await this.queryEntities(transaction, "courses", courseIds);
    const providerIdsAll = unique([
      ...providerIds,
      ...roots
        .filter((root) => root.type === "PROVIDER")
        .map((root) => root.id),
      ...courses.map((row) => row.providerId),
      ...deliveries.map((row) => row.providerId),
      ...intakes.map((row) => row.providerId),
    ]);
    const providers = await this.queryEntities(
      transaction,
      "providers",
      providerIdsAll
    );
    const total =
      providers.length + courses.length + deliveries.length + intakes.length;
    if (total > this.bounds.entityRows) {
      fail(
        "read_bound_exceeded",
        "Education catalog entity projection exceeds the read bound."
      );
    }
    for (const root of roots) {
      const exists =
        root.type === "PROVIDER"
          ? providers.some((row) => row.providerId === root.id)
          : root.type === "COURSE"
            ? courses.some((row) => row.courseId === root.id)
            : root.type === "DELIVERY"
              ? deliveries.some((row) => row.deliveryId === root.id)
              : intakes.some((row) => row.intakeId === root.id);
      if (!exists) {
        fail(
          "missing_entity",
          `Education target ${root.type}:${root.id} does not exist.`
        );
      }
    }
    if (
      courses.some(
        (row) =>
          !providers.some((provider) => provider.providerId === row.providerId)
      ) ||
      deliveries.some(
        (row) => !courses.some((course) => course.courseId === row.courseId)
      ) ||
      intakes.some(
        (row) =>
          !deliveries.some((delivery) => delivery.deliveryId === row.deliveryId)
      )
    ) {
      fail(
        "inconsistent_storage",
        "Education catalog entity ancestry is incomplete."
      );
    }
    return { providers, courses, deliveries, intakes };
  }

  private async queryEntities<K extends EducationCatalogEntityTable>(
    transaction: EducationCatalogTransaction,
    table: K,
    ids: readonly string[]
  ): Promise<EducationCatalogRowMap[K][]> {
    if (!ids.length) {
      return [];
    }
    const rows = exactRows(
      await transaction.query({
        kind: "entity_ids",
        table,
        ids,
        limit: this.bounds.entityRows + 1,
      }),
      table
    );
    assertWithinBound(rows, this.bounds.entityRows, `${table} entities`);
    if (rows.length !== new Set(ids).size) {
      fail(
        "inconsistent_storage",
        `Education catalog ${table} ancestry is incomplete.`
      );
    }
    return rows;
  }
}

function datasetFromRows(input: {
  readonly providers: readonly EducationProviderRow[];
  readonly courses: readonly EducationCourseRow[];
  readonly deliveries: readonly EducationDeliveryRow[];
  readonly intakes: readonly EducationIntakeRow[];
  readonly sources: readonly EducationSourceRow[];
  readonly snapshots: readonly EducationSnapshotRow[];
  readonly observations: readonly EducationFieldObservationRow[];
}): EducationDataset {
  const providers: EducationProvider[] = input.providers.map((row) => ({
    providerId: row.providerId,
    recordClass: row.recordClass,
    displayName: row.displayName,
    ...(row.legalName === null ? {} : { legalName: row.legalName }),
    ...(row.aliases === null ? {} : { aliases: row.aliases }),
    ...(row.cricosProviderCode === null
      ? {}
      : { cricosProviderCode: row.cricosProviderCode }),
    ...(row.category === null ? {} : { category: row.category }),
  }));
  const courses: EducationCourse[] = input.courses.map((row) => ({
    courseId: row.courseId,
    providerId: row.providerId,
    recordClass: row.recordClass,
    title: row.title,
    ...(row.qualificationLevel === null
      ? {}
      : { qualificationLevel: row.qualificationLevel }),
    ...(row.sector === null ? {} : { sector: row.sector }),
    ...(row.cricosCourseCode === null
      ? {}
      : { cricosCourseCode: row.cricosCourseCode }),
    ...(row.institutionCourseCode === null
      ? {}
      : { institutionCourseCode: row.institutionCourseCode }),
    ...(row.studyField === null ? {} : { studyField: row.studyField }),
  }));
  const deliveries: EducationDelivery[] = input.deliveries.map((row) => ({
    deliveryId: row.deliveryId,
    courseId: row.courseId,
    recordClass: row.recordClass,
    ...(row.campusId === null ? {} : { campusId: row.campusId }),
    ...(row.siteId === null ? {} : { siteId: row.siteId }),
    ...(row.campusName === null ? {} : { campusName: row.campusName }),
    ...(row.city === null ? {} : { city: row.city }),
    ...(row.state === null ? {} : { state: row.state }),
    ...(row.mode === null ? {} : { mode: row.mode }),
  }));
  const intakes: EducationIntake[] = input.intakes.map((row) => ({
    intakeId: row.intakeId,
    deliveryId: row.deliveryId,
    recordClass: row.recordClass,
    ...(row.intakeCode === null ? {} : { intakeCode: row.intakeCode }),
    ...(row.term === null ? {} : { term: row.term }),
    ...(row.year === null ? {} : { year: row.year }),
    ...(row.startDate === null ? {} : { startDate: row.startDate }),
    ...(row.applicationDeadline === null
      ? {}
      : { applicationDeadline: row.applicationDeadline }),
  }));
  const sources: EducationSource[] = input.sources.map((row) => ({
    sourceId: row.sourceId,
    sourceFamily: row.sourceFamily,
    recordClass: row.recordClass,
    authorityName: row.authorityName,
    originalUrl: row.originalUrl,
    canonicalUrl: row.canonicalUrl,
    scope:
      row.scopeKind === "PROVIDER"
        ? { kind: "PROVIDER", providerId: row.providerId as string }
        : { kind: "CATALOG" },
    language: row.language,
    accessMode: row.accessMode,
  }));
  const snapshots: EducationSnapshot[] = input.snapshots.map((row) => ({
    snapshotId: row.snapshotId,
    sourceId: row.sourceId,
    recordClass: row.recordClass,
    sourceUrl: row.sourceUrl,
    retrievedAt: row.retrievedAt,
    observedAt: row.observedAt,
    ...(row.publishedAt === null ? {} : { publishedAt: row.publishedAt }),
    ...(row.effectiveFrom === null ? {} : { effectiveFrom: row.effectiveFrom }),
    ...(row.effectiveTo === null ? {} : { effectiveTo: row.effectiveTo }),
    ...(row.contentSha256 === null ? {} : { contentSha256: row.contentSha256 }),
    ...(row.parserVersion === null ? {} : { parserVersion: row.parserVersion }),
    ...(row.contentExcerpt === null
      ? {}
      : { contentExcerpt: row.contentExcerpt }),
    ...(row.locator === null ? {} : { locator: row.locator }),
    acquisitionOutcome: row.acquisitionOutcome,
  }));
  const observations: EducationFieldObservation[] = input.observations.map(
    (row) => {
      const target = targetFromObservation(row);
      return {
        observationId: row.observationId,
        target,
        fieldKey: row.fieldKey,
        claimDomain: row.claimDomain,
        recordClass: row.recordClass,
        disposition: row.disposition,
        ...(row.value === null ? {} : { value: row.value }),
        provenance: {
          sourceId: row.sourceId,
          snapshotId: row.snapshotId,
          sourceFamily: row.sourceFamily,
          sourceUrl: row.sourceUrl,
          contentSha256: row.contentSha256,
          locator: row.locator,
          ...(row.excerpt === null ? {} : { excerpt: row.excerpt }),
        },
        observedAt: row.observedAt,
        ...(row.effectiveFrom === null
          ? {}
          : { effectiveFrom: row.effectiveFrom }),
        ...(row.effectiveTo === null ? {} : { effectiveTo: row.effectiveTo }),
      };
    }
  );
  return {
    providers,
    courses,
    deliveries,
    intakes,
    sources,
    snapshots,
    observations,
  };
}
