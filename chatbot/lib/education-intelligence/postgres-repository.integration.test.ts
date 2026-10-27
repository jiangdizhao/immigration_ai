// biome-ignore-all lint/suspicious/noMisplacedAssertion: Helpers run only from the guarded node:test callback.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { sql as drizzleSql, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  educationCourse,
  educationDelivery,
  educationFieldObservation,
  educationIntake,
  educationProvider,
  educationSnapshot,
  educationSource,
} from "@/lib/db/schema";
import { EducationCatalogRepositoryError } from "./catalog-repository-core";
import type {
  EducationDataset,
  EducationFieldObservation,
  EducationSnapshot,
  EducationSource,
} from "./contracts";
import { createSyntheticEducationFixture } from "./fixtures";
import { canonicalizeEducationUrl } from "./identity";
import {
  type InjectedEducationCatalogDatabase,
  PostgresEducationCatalogRepository,
} from "./postgres-repository";

const EXPECTED_DATABASE = "immigration_ai_phase13_m3_002_test";
const EXPECTED_MIGRATION_TIMESTAMP = 1_793_052_726_837;
const databaseUrl = process.env.PHASE13_M3_002_TEST_DATABASE_URL?.trim() ?? "";
const enabled = process.env.PHASE13_M3_002_POSTGRES_TESTS === "1";
type Database = ReturnType<typeof drizzle>;
type PgTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function idFactory(): (value: string) => string {
  const prefix = `m3r1-${randomUUID().replaceAll("-", "")}`;
  return (value) => `${prefix}-${value}`;
}

function isolatedDataset(
  base: EducationDataset,
  id: (value: string) => string
) {
  const entityIds = new Map<string, string>();
  for (const item of base.providers) {
    entityIds.set(item.providerId, id(item.providerId));
  }
  for (const item of base.courses) {
    entityIds.set(item.courseId, id(item.courseId));
  }
  for (const item of base.deliveries) {
    entityIds.set(item.deliveryId, id(item.deliveryId));
  }
  for (const item of base.intakes) {
    entityIds.set(item.intakeId, id(item.intakeId));
  }
  for (const item of base.sources) {
    entityIds.set(item.sourceId, id(item.sourceId));
  }
  for (const item of base.snapshots) {
    entityIds.set(item.snapshotId, id(item.snapshotId));
  }
  for (const item of base.observations) {
    entityIds.set(item.observationId, id(item.observationId));
  }
  const mappedId = (value: string) => entityIds.get(value) ?? id(value);
  const sourceUrls = new Map<string, string>();
  const sources = base.sources.map((source) => {
    const url = new URL(source.originalUrl);
    url.pathname = `${url.pathname.replace(/\/$/u, "")}/${id("source-path")}`;
    const originalUrl = url.toString();
    const canonicalUrl = canonicalizeEducationUrl(originalUrl);
    sourceUrls.set(source.sourceId, canonicalUrl);
    return {
      ...source,
      sourceId: mappedId(source.sourceId),
      originalUrl,
      canonicalUrl,
      scope:
        source.scope.kind === "PROVIDER"
          ? {
              kind: "PROVIDER" as const,
              providerId: mappedId(source.scope.providerId),
            }
          : source.scope,
    };
  });
  const snapshots = base.snapshots.map((snapshot) => ({
    ...snapshot,
    snapshotId: mappedId(snapshot.snapshotId),
    sourceId: mappedId(snapshot.sourceId),
    sourceUrl: sourceUrls.get(snapshot.sourceId) as string,
  }));
  const observations = base.observations.map((observation) => ({
    ...observation,
    observationId: mappedId(observation.observationId),
    target: { ...observation.target, id: mappedId(observation.target.id) },
    provenance: {
      ...observation.provenance,
      sourceId: mappedId(observation.provenance.sourceId),
      snapshotId: mappedId(observation.provenance.snapshotId),
      sourceUrl: sourceUrls.get(observation.provenance.sourceId) as string,
      locator: `${observation.provenance.locator}/${id("locator")}`,
    },
  }));
  return {
    providers: base.providers.map((provider) => ({
      ...provider,
      providerId: mappedId(provider.providerId),
      ...(provider.cricosProviderCode
        ? { cricosProviderCode: id(provider.cricosProviderCode) }
        : {}),
    })),
    courses: base.courses.map((course) => ({
      ...course,
      courseId: mappedId(course.courseId),
      providerId: mappedId(course.providerId),
      ...(course.cricosCourseCode
        ? { cricosCourseCode: id(course.cricosCourseCode) }
        : {}),
      ...(course.institutionCourseCode
        ? { institutionCourseCode: id(course.institutionCourseCode) }
        : {}),
    })),
    deliveries: base.deliveries.map((delivery) => ({
      ...delivery,
      deliveryId: mappedId(delivery.deliveryId),
      courseId: mappedId(delivery.courseId),
      ...(delivery.campusId ? { campusId: id(delivery.campusId) } : {}),
      ...(delivery.siteId ? { siteId: id(delivery.siteId) } : {}),
    })),
    intakes: base.intakes.map((intake) => ({
      ...intake,
      intakeId: mappedId(intake.intakeId),
      deliveryId: mappedId(intake.deliveryId),
      intakeCode: intake.intakeCode
        ? id(intake.intakeCode)
        : id("fixture-intake-code"),
    })),
    sources,
    snapshots,
    observations,
  } satisfies EducationDataset;
}

async function expectPostgresFailure(
  transaction: PgTransaction,
  operation: (savepoint: PgTransaction) => Promise<unknown>,
  expected: {
    readonly caseName: string;
    readonly code: string;
    readonly constraint?: string;
    readonly constraints?: readonly string[];
    readonly message?: RegExp;
  }
): Promise<void> {
  const expectedConstraint = expected.constraint
    ? `constraint ${expected.constraint}`
    : expected.constraints
      ? `one of constraints ${expected.constraints.join(", ")}`
      : expected.message
        ? `message ${String(expected.message)}`
        : "no specific constraint";
  await assert.rejects(
    transaction.transaction(operation),
    (error: unknown) => {
      const detail = error as {
        readonly code?: string;
        readonly constraint_name?: string;
        readonly message?: string;
      };
      const diagnostic = `${expected.caseName}: expected SQLSTATE ${expected.code}, ${expectedConstraint}; actual SQLSTATE ${detail.code ?? "<missing>"}, constraint ${detail.constraint_name ?? "<missing>"}, message ${detail.message ?? "<missing>"}`;
      assert.equal(detail.code, expected.code, diagnostic);
      if (expected.constraint) {
        assert.equal(detail.constraint_name, expected.constraint, diagnostic);
      }
      if (expected.constraints) {
        assert.ok(
          expected.constraints.includes(detail.constraint_name ?? ""),
          diagnostic
        );
      }
      if (expected.message) {
        assert.match(detail.message ?? "", expected.message, diagnostic);
      }
      return true;
    },
    `${expected.caseName}: expected SQLSTATE ${expected.code}, ${expectedConstraint}`
  );
}

function changeObservationLocator(
  dataset: EducationDataset,
  observationId: string
): EducationDataset {
  return {
    ...dataset,
    observations: dataset.observations.map((observation) =>
      observation.observationId === observationId
        ? {
            ...observation,
            provenance: {
              ...observation.provenance,
              locator: `${observation.provenance.locator}/conflict`,
            },
          }
        : observation
    ),
  };
}

function makeAbaHistory(
  dataset: EducationDataset,
  id: (value: string) => string
): EducationDataset {
  const baseObservation = dataset.observations.find(
    (observation) => observation.fieldKey === "COURSE_TITLE"
  );
  assert.ok(baseObservation);
  const baseSnapshot = dataset.snapshots.find(
    (snapshot) => snapshot.snapshotId === baseObservation.provenance.snapshotId
  );
  assert.ok(baseSnapshot);
  const history = ["A", "B", "A"] as const;
  const snapshots: EducationSnapshot[] = history.map((value, index) => {
    const observedAt = `2028-0${index + 1}-01T00:00:00.000Z`;
    const contentExcerpt = `A-B-A history ${value}`;
    return {
      ...baseSnapshot,
      snapshotId: id(`aba-snapshot-${index + 1}`),
      retrievedAt: observedAt,
      observedAt,
      contentSha256: createHash("sha256")
        .update(contentExcerpt, "utf8")
        .digest("hex"),
      contentExcerpt,
    };
  });
  const observations: EducationFieldObservation[] = history.map(
    (value, index) => {
      const snapshot = snapshots[index];
      assert.ok(snapshot);
      return {
        ...baseObservation,
        observationId: id(`aba-observation-${index + 1}`),
        value: { kind: "text", value: `History ${value}` },
        observedAt: snapshot.observedAt,
        provenance: {
          ...baseObservation.provenance,
          snapshotId: snapshot.snapshotId,
          contentSha256: snapshot.contentSha256 as string,
          sourceUrl: snapshot.sourceUrl,
          locator: `/history/${index + 1}`,
          excerpt: snapshot.contentExcerpt,
        },
      };
    }
  );
  return {
    ...dataset,
    snapshots: [...dataset.snapshots, ...snapshots],
    observations: [...dataset.observations, ...observations],
  };
}

async function exerciseCatalog(transaction: PgTransaction): Promise<void> {
  const db = transaction;
  const repositoryDatabase: InjectedEducationCatalogDatabase = {
    // A Drizzle nested transaction is a savepoint and inherits the outer
    // transaction settings; its installed API accepts only the callback.
    transaction: (operation, _config) => transaction.transaction(operation),
  };
  const id = idFactory();
  const dataset = isolatedDataset(
    createSyntheticEducationFixture("VET").dataset,
    id
  );
  const catalog = new PostgresEducationCatalogRepository(repositoryDatabase);

  const inserted = await catalog.ingest(dataset);
  assert.ok(inserted.inserted.observations > 0);
  const replay = await catalog.ingest(dataset);
  assert.ok(Object.values(replay.inserted).every((count) => count === 0));
  assert.deepEqual(replay.replayed, {
    providers: dataset.providers.length,
    courses: dataset.courses.length,
    deliveries: dataset.deliveries.length,
    intakes: dataset.intakes.length,
    sources: dataset.sources.length,
    snapshots: dataset.snapshots.length,
    observations: dataset.observations.length,
  });

  const changedProvider = {
    ...dataset.providers[0],
    displayName: `${dataset.providers[0].displayName} changed`,
  };
  await assert.rejects(
    catalog.ingest({
      ...dataset,
      providers: [changedProvider, ...dataset.providers.slice(1)],
    }),
    (error: unknown) =>
      error instanceof EducationCatalogRepositoryError &&
      error.code === "integrity_conflict"
  );

  const conflictObservation = dataset.observations.find(
    (observation) => observation.disposition === "ASSERTION"
  );
  assert.ok(conflictObservation);
  const rollbackProviderId = id("rollback-provider");
  await assert.rejects(
    catalog.ingest({
      ...changeObservationLocator(dataset, conflictObservation.observationId),
      providers: [
        ...dataset.providers,
        {
          providerId: rollbackProviderId,
          recordClass: "SYNTHETIC",
          displayName: "Synthetic rollback witness",
        },
      ],
    }),
    (error: unknown) =>
      error instanceof EducationCatalogRepositoryError &&
      error.code === "integrity_conflict"
  );
  assert.equal(
    (
      await db
        .select({ providerId: educationProvider.providerId })
        .from(educationProvider)
        .where(eq(educationProvider.providerId, rollbackProviderId))
        .limit(1)
    ).length,
    0,
    "a conflicting batch must roll back rows inserted earlier in that transaction"
  );

  const provider = dataset.providers[0];
  const course = dataset.courses[0];
  const delivery = dataset.deliveries[0];
  const intake = dataset.intakes[0];
  const institutionSource = dataset.sources.find(
    (source) => source.sourceFamily === "INSTITUTION"
  );
  const cricosSource = dataset.sources.find(
    (source) => source.sourceFamily === "CRICOS"
  );
  const baseObservation = dataset.observations.find(
    (observation) => observation.fieldKey === "COURSE_TITLE"
  );
  assert.ok(
    provider &&
      course &&
      delivery &&
      intake &&
      institutionSource &&
      cricosSource &&
      baseObservation
  );

  const [courseRow] = await db
    .select()
    .from(educationCourse)
    .where(eq(educationCourse.courseId, course.courseId))
    .limit(1);
  const [deliveryRow] = await db
    .select()
    .from(educationDelivery)
    .where(eq(educationDelivery.deliveryId, delivery.deliveryId))
    .limit(1);
  const [intakeRow] = await db
    .select()
    .from(educationIntake)
    .where(eq(educationIntake.intakeId, intake.intakeId))
    .limit(1);
  const [sourceRow] = await db
    .select()
    .from(educationSource)
    .where(eq(educationSource.sourceId, cricosSource.sourceId))
    .limit(1);
  const [institutionSourceRow] = await db
    .select()
    .from(educationSource)
    .where(eq(educationSource.sourceId, institutionSource.sourceId))
    .limit(1);
  const [observationRow] = await db
    .select()
    .from(educationFieldObservation)
    .where(
      eq(educationFieldObservation.observationId, baseObservation.observationId)
    )
    .limit(1);
  const [snapshotRow] = await db
    .select()
    .from(educationSnapshot)
    .where(
      eq(educationSnapshot.snapshotId, baseObservation.provenance.snapshotId)
    )
    .limit(1);
  assert.ok(
    courseRow &&
      deliveryRow &&
      intakeRow &&
      sourceRow &&
      institutionSourceRow &&
      observationRow &&
      snapshotRow
  );
  if (typeof snapshotRow.contentSha256 !== "string") {
    throw new Error("captured snapshot must have a content hash");
  }
  const observationContentSha256 = snapshotRow.contentSha256;

  await expectPostgresFailure(
    transaction,
    async (savepoint) => {
      await savepoint.insert(educationCourse).values({
        ...courseRow,
        courseId: id("orphan-course"),
        providerId: id("missing-provider"),
      });
    },
    {
      caseName: "course insert with missing provider",
      code: "23503",
      constraint: "EducationCourse_provider_record_class_fk",
    }
  );
  await expectPostgresFailure(
    transaction,
    async (savepoint) => {
      await savepoint.insert(educationDelivery).values({
        ...deliveryRow,
        deliveryId: id("record-class-delivery"),
        recordClass: "UNVERIFIED",
        campusId: id("record-class-campus"),
        siteId: null,
      });
    },
    {
      caseName: "delivery RecordClass mismatch with distinct location identity",
      code: "23503",
      constraint: "EducationDelivery_course_provider_class_fk",
    }
  );
  await expectPostgresFailure(
    transaction,
    async (savepoint) => {
      await savepoint.insert(educationIntake).values({
        ...intakeRow,
        intakeId: id("record-class-intake"),
        recordClass: "UNVERIFIED",
        intakeCode: id("record-class-intake-code"),
      });
    },
    {
      caseName: "intake RecordClass mismatch with distinct intake identity",
      code: "23503",
      constraint: "EducationIntake_delivery_provider_class_fk",
    }
  );

  const unverifiedObservationEvidenceUrl = canonicalizeEducationUrl(
    `https://catalog.education.gov.au/${id("observation-class-evidence")}`
  );
  const unverifiedObservationSourceId = id("observation-class-source");
  const unverifiedObservationSnapshotId = id("observation-class-snapshot");
  await db.insert(educationSource).values({
    ...sourceRow,
    sourceId: unverifiedObservationSourceId,
    recordClass: "UNVERIFIED",
    originalUrl: unverifiedObservationEvidenceUrl,
    canonicalUrl: unverifiedObservationEvidenceUrl,
    accessMode: "CURATED_REFERENCE",
  });
  await db.insert(educationSnapshot).values({
    ...snapshotRow,
    snapshotId: unverifiedObservationSnapshotId,
    sourceId: unverifiedObservationSourceId,
    recordClass: "UNVERIFIED",
    sourceUrl: unverifiedObservationEvidenceUrl,
  });
  await expectPostgresFailure(
    transaction,
    async (savepoint) => {
      await savepoint.insert(educationFieldObservation).values({
        ...observationRow,
        observationId: id("record-class-observation"),
        recordClass: "UNVERIFIED",
        fieldKey: "CRICOS_COURSE_STATUS",
        claimDomain: "CRICOS_REGISTRATION",
        value: { kind: "enum", value: "REGISTERED" },
        sourceId: unverifiedObservationSourceId,
        sourceFamily: "CRICOS",
        sourceScopeKind: "CATALOG",
        sourceScopeKey: "",
        snapshotId: unverifiedObservationSnapshotId,
        sourceUrl: unverifiedObservationEvidenceUrl,
        contentSha256: observationContentSha256,
        snapshotOutcome: snapshotRow.acquisitionOutcome,
      });
    },
    {
      caseName:
        "observation RecordClass mismatch against synthetic target hierarchy",
      code: "23503",
      constraints: [
        "EducationFieldObservation_target_provider_class_fk",
        "EducationFieldObservation_course_target_fk",
      ],
    }
  );
  await expectPostgresFailure(
    transaction,
    async (savepoint) => {
      await savepoint.insert(educationDelivery).values({
        ...deliveryRow,
        deliveryId: id("orphan-delivery"),
        courseId: id("missing-course"),
      });
    },
    {
      caseName: "delivery references a missing course",
      code: "23503",
      constraint: "EducationDelivery_course_provider_class_fk",
    }
  );
  await expectPostgresFailure(
    transaction,
    async (savepoint) => {
      await savepoint.insert(educationIntake).values({
        ...intakeRow,
        intakeId: id("orphan-intake"),
        deliveryId: id("missing-delivery"),
      });
    },
    {
      caseName: "intake references a missing delivery",
      code: "23503",
      constraint: "EducationIntake_delivery_provider_class_fk",
    }
  );
  const observationTargets = [
    {
      targetType: "PROVIDER",
      targetColumn: "providerTargetId",
      expectedConstraints: [
        "EducationFieldObservation_provider_target_fk",
        "EducationFieldObservation_target_provider_class_fk",
      ],
    },
    {
      targetType: "COURSE",
      targetColumn: "courseTargetId",
      expectedConstraints: ["EducationFieldObservation_course_target_fk"],
    },
    {
      targetType: "DELIVERY",
      targetColumn: "deliveryTargetId",
      expectedConstraints: ["EducationFieldObservation_delivery_target_fk"],
    },
    {
      targetType: "INTAKE",
      targetColumn: "intakeTargetId",
      expectedConstraints: ["EducationFieldObservation_intake_target_fk"],
    },
  ] as const;
  for (const {
    targetType,
    targetColumn,
    expectedConstraints,
  } of observationTargets) {
    const observation = dataset.observations.find(
      (candidate) => candidate.target.type === targetType
    );
    assert.ok(observation);
    const [row] = await db
      .select()
      .from(educationFieldObservation)
      .where(
        eq(educationFieldObservation.observationId, observation.observationId)
      )
      .limit(1);
    assert.ok(row);
    const missingTargetId = id(`missing-${targetType.toLowerCase()}`);
    const invalidRow = {
      ...row,
      observationId: id(`orphan-observation-${targetType.toLowerCase()}`),
      [targetColumn]: missingTargetId,
      ...(targetType === "PROVIDER"
        ? { targetProviderId: missingTargetId }
        : {}),
    };
    await expectPostgresFailure(
      transaction,
      async (savepoint) => {
        await savepoint.insert(educationFieldObservation).values(invalidRow);
      },
      {
        caseName: `observation ${targetType} target FK with missing target ID`,
        code: "23503",
        constraints: expectedConstraints,
      }
    );
  }

  await expectPostgresFailure(
    transaction,
    async (savepoint) => {
      await savepoint.insert(educationCourse).values({
        ...courseRow,
        courseId: id("record-class-course"),
        recordClass: "UNVERIFIED",
        cricosCourseCode: id("record-class-course-cricos-code"),
        institutionCourseCode: id("record-class-course-institution-code"),
      });
    },
    {
      caseName: "course RecordClass mismatch with unique external codes",
      code: "23503",
      constraint: "EducationCourse_provider_record_class_fk",
    }
  );
  await expectPostgresFailure(
    transaction,
    async (savepoint) => {
      await savepoint.insert(educationSnapshot).values({
        ...snapshotRow,
        snapshotId: id("record-class-snapshot"),
        recordClass: "UNVERIFIED",
      });
    },
    {
      caseName: "snapshot RecordClass mismatch against source",
      code: "23503",
      constraint: "EducationSnapshot_source_class_url_fk",
    }
  );
  await expectPostgresFailure(
    transaction,
    async (savepoint) => {
      const unverifiedUrl = canonicalizeEducationUrl(
        `https://catalog.education.gov.au/${id("unverified-provider-source")}`
      );
      await savepoint.insert(educationSource).values({
        ...institutionSourceRow,
        sourceId: id("record-class-source"),
        recordClass: "UNVERIFIED",
        originalUrl: unverifiedUrl,
        canonicalUrl: unverifiedUrl,
        accessMode: "CURATED_REFERENCE",
      });
    },
    {
      caseName: "source RecordClass mismatch against provider",
      code: "23503",
      constraint: "EducationSource_provider_record_class_fk",
    }
  );

  const alternateInstitutionUrl = canonicalizeEducationUrl(
    `${institutionSource.canonicalUrl}/alternate-${id("path")}`
  );
  const alternateInstitutionSource = {
    ...institutionSourceRow,
    sourceId: id("alternate-institution-source"),
    originalUrl: alternateInstitutionUrl,
    canonicalUrl: alternateInstitutionUrl,
  };
  await db.insert(educationSource).values(alternateInstitutionSource);
  await expectPostgresFailure(
    transaction,
    async (savepoint) => {
      await savepoint.insert(educationFieldObservation).values({
        ...observationRow,
        observationId: id("wrong-source-snapshot-observation"),
        sourceId: alternateInstitutionSource.sourceId,
        sourceUrl: alternateInstitutionSource.canonicalUrl,
      });
    },
    {
      caseName: "observation source URL does not match its snapshot evidence",
      code: "23503",
      constraint: "EducationFieldObservation_snapshot_evidence_fk",
    }
  );
  await expectPostgresFailure(
    transaction,
    async (savepoint) => {
      await savepoint
        .insert(educationSource)
        .values({ ...sourceRow, sourceId: id("duplicate-source-identity") });
    },
    {
      caseName: "duplicate source identity",
      code: "23505",
      constraint: "EducationSource_catalog_family_url_unique",
    }
  );

  const [validIntakeRow] = await db
    .select()
    .from(educationIntake)
    .where(eq(educationIntake.intakeId, intake.intakeId))
    .limit(1);
  assert.ok(validIntakeRow);
  await expectPostgresFailure(
    transaction,
    async (savepoint) => {
      await savepoint.insert(educationIntake).values({
        ...validIntakeRow,
        intakeId: id("duplicate-intake-identity"),
      });
    },
    {
      caseName: "duplicate intake identity",
      code: "23505",
      constraint: "EducationIntake_delivery_code_period_unique",
    }
  );
  const nextYear = (validIntakeRow.year ?? 2027) + 1;
  const nextStartDate = `${nextYear}-03-01`;
  await db.insert(educationIntake).values({
    ...validIntakeRow,
    intakeId: id("reused-intake-code-next-year"),
    year: nextYear,
    startDate: nextStartDate,
  });

  const unverifiedSources: EducationSource[] = [
    {
      sourceId: id("unverified-path-source"),
      sourceFamily: "CRICOS",
      recordClass: "UNVERIFIED",
      authorityName: "Test public registry reference",
      originalUrl: "https://catalog.education.gov.au/catalog/.example/",
      canonicalUrl: canonicalizeEducationUrl(
        "https://catalog.education.gov.au/catalog/.example/"
      ),
      scope: { kind: "CATALOG" },
      language: "en-AU",
      accessMode: "CURATED_REFERENCE",
    },
    {
      sourceId: id("unverified-query-source"),
      sourceFamily: "CRICOS",
      recordClass: "UNVERIFIED",
      authorityName: "Test public registry reference",
      originalUrl: "https://catalog.education.gov.au/search?mirror=.example",
      canonicalUrl: canonicalizeEducationUrl(
        "https://catalog.education.gov.au/search?mirror=.example"
      ),
      scope: { kind: "CATALOG" },
      language: "en-AU",
      accessMode: "CURATED_REFERENCE",
    },
  ];
  for (const source of unverifiedSources) {
    await db.insert(educationSource).values({
      sourceId: source.sourceId,
      sourceFamily: source.sourceFamily,
      recordClass: source.recordClass,
      authorityName: source.authorityName,
      originalUrl: source.originalUrl,
      canonicalUrl: source.canonicalUrl,
      scopeKind: "CATALOG",
      providerId: null,
      scopeKey: "",
      language: source.language,
      accessMode: source.accessMode,
    });
  }
  for (const [caseName, url] of [
    [
      "synthetic CRICOS source with path-only reserved suffix",
      "https://catalog.education.gov.au/catalog/cricos.example/",
    ],
    [
      "synthetic CRICOS source with query-only reserved suffix",
      `https://catalog.education.gov.au/search?mirror=.example&case=${id("synthetic-query-host-test")}`,
    ],
  ]) {
    const canonicalUrl = canonicalizeEducationUrl(url);
    await expectPostgresFailure(
      transaction,
      async (savepoint) => {
        await savepoint.insert(educationSource).values({
          ...sourceRow,
          sourceId: id(
            `source-host-test-${url.includes("?") ? "query" : "path"}`
          ),
          originalUrl: canonicalUrl,
          canonicalUrl,
        });
      },
      {
        caseName,
        code: "23514",
        constraint: "EducationSource_class_host_check",
      }
    );
  }
  const unverifiedReservedHostUrl = canonicalizeEducationUrl(
    `${sourceRow.canonicalUrl}/unverified-${id("reserved-host")}`
  );
  await expectPostgresFailure(
    transaction,
    async (savepoint) => {
      await savepoint.insert(educationSource).values({
        ...sourceRow,
        sourceId: id("unverified-reserved-synthetic-host"),
        recordClass: "UNVERIFIED",
        originalUrl: unverifiedReservedHostUrl,
        canonicalUrl: unverifiedReservedHostUrl,
        accessMode: "CURATED_REFERENCE",
      });
    },
    {
      caseName: "reserved synthetic hostname cannot be labeled UNVERIFIED",
      code: "23514",
      constraint: "EducationSource_class_host_check",
    }
  );
  const spoofedSyntheticUrl = canonicalizeEducationUrl(
    "https://pilot.cricos.example.attacker.test/course"
  );
  await expectPostgresFailure(
    transaction,
    async (savepoint) => {
      await savepoint.insert(educationSource).values({
        ...sourceRow,
        sourceId: id("synthetic-lookalike-host"),
        originalUrl: spoofedSyntheticUrl,
        canonicalUrl: spoofedSyntheticUrl,
      });
    },
    {
      caseName: "synthetic hostname lookalike suffix is rejected",
      code: "23514",
      constraint: "EducationSource_class_host_check",
    }
  );
  for (const [label, rawUrl] of [
    ["userinfo", "https://user:secret@pilot.cricos.example/course"],
    ["port", "https://pilot.cricos.example:8443/course"],
  ] as const) {
    await expectPostgresFailure(
      transaction,
      async (savepoint) => {
        await savepoint.insert(educationSource).values({
          ...sourceRow,
          sourceId: id(`synthetic-host-${label}`),
          originalUrl: rawUrl,
          canonicalUrl: rawUrl,
        });
      },
      {
        caseName: `synthetic host extraction rejects authority ${label}`,
        code: "23514",
        constraint: "EducationSource_class_host_check",
      }
    );
  }
  await expectPostgresFailure(
    transaction,
    async (savepoint) => {
      await savepoint.insert(educationSource).values({
        ...sourceRow,
        sourceId: id("synthetic-cross-family-source"),
        sourceFamily: "STUDY_AUSTRALIA",
      });
    },
    {
      caseName: "synthetic hostname must match its source family",
      code: "23514",
      constraint: "EducationSource_class_host_check",
    }
  );

  const abaDataset = makeAbaHistory(dataset, id);
  const abaWrite = await catalog.ingest(abaDataset);
  assert.equal(abaWrite.inserted.snapshots, 3);
  assert.equal(abaWrite.inserted.observations, 3);
  const historyProjection = await catalog.readSourceScope(
    baseObservation.provenance.sourceId
  );
  const historyIds = new Set([
    id("aba-snapshot-1"),
    id("aba-snapshot-2"),
    id("aba-snapshot-3"),
  ]);
  const persistedHistory = historyProjection.snapshots
    .filter((snapshot) => historyIds.has(snapshot.snapshotId))
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  assert.deepEqual(
    persistedHistory.map((snapshot) => snapshot.contentExcerpt),
    ["A-B-A history A", "A-B-A history B", "A-B-A history A"]
  );
  const historyObservations = historyProjection.observations
    .filter((observation) =>
      observation.observationId.startsWith(id("aba-observation-"))
    )
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  assert.deepEqual(
    historyObservations.map((observation) => observation.value),
    ["History A", "History B", "History A"].map((value) => ({
      kind: "text",
      value,
    }))
  );

  const snapshotId = dataset.snapshots[0].snapshotId;
  const observationId = dataset.observations[0].observationId;
  for (const table of [
    "EducationSnapshot",
    "EducationFieldObservation",
  ] as const) {
    const rowId = table === "EducationSnapshot" ? snapshotId : observationId;
    const column =
      table === "EducationSnapshot" ? "snapshotId" : "observationId";
    const mutableColumn =
      table === "EducationSnapshot" ? "contentExcerpt" : "excerpt";
    for (const mutation of ["UPDATE", "DELETE"] as const) {
      await expectPostgresFailure(
        transaction,
        async (savepoint) => {
          await savepoint.execute(
            mutation === "UPDATE"
              ? drizzleSql`UPDATE ${drizzleSql.raw(`"${table}"`)} SET ${drizzleSql.raw(`"${mutableColumn}"`)} = 'mutation attempt' WHERE ${drizzleSql.raw(`"${column}"`)} = ${rowId}`
              : drizzleSql`DELETE FROM ${drizzleSql.raw(`"${table}"`)} WHERE ${drizzleSql.raw(`"${column}"`)} = ${rowId}`
          );
        },
        {
          caseName: `${table} ${mutation} append-only guard`,
          code: "23514",
          message: /append-only/u,
        }
      );
    }
    await expectPostgresFailure(
      transaction,
      async (savepoint) => {
        await savepoint.execute(
          drizzleSql.raw(
            `TRUNCATE TABLE "${table}"${table === "EducationSnapshot" ? " CASCADE" : ""}`
          )
        );
      },
      {
        caseName: `${table} TRUNCATE append-only guard`,
        code: "23514",
        message: /append-only/u,
      }
    );
  }
}

test(
  "opt-in catalog PostgreSQL integrity suite is isolated to its exact migrated test database",
  {
    skip:
      !enabled || !databaseUrl
        ? "pending explicit exact-database authorization"
        : false,
  },
  async () => {
    const configured = new URL(databaseUrl);
    assert.equal(
      decodeURIComponent(configured.pathname.slice(1)),
      EXPECTED_DATABASE
    );
    assert.equal(configured.hostname, "127.0.0.1");
    assert.equal(configured.port || "5432", "5432");

    const postgresClient = postgres(databaseUrl, { max: 1, idle_timeout: 5 });
    try {
      const [identity] = await postgresClient<
        { database: string; host: string; port: number }[]
      >`
        select current_database() as database,
               host(inet_server_addr()) as host,
               inet_server_port() as port
      `;
      assert.equal(identity?.database, EXPECTED_DATABASE);
      assert.equal(identity?.host, "127.0.0.1");
      assert.equal(Number(identity?.port), 5432);

      const [ledgerRelation] = await postgresClient<
        { relation: string | null }[]
      >`
        select to_regclass('drizzle.__drizzle_migrations')::text as relation
      `;
      assert.ok(
        ledgerRelation?.relation,
        "migration ledger must exist before test writes"
      );
      const [ledger] = await postgresClient<
        { createdAt: string | number | null }[]
      >`
        select created_at as "createdAt"
        from drizzle.__drizzle_migrations
        order by created_at desc
        limit 1
      `;
      assert.equal(Number(ledger?.createdAt), EXPECTED_MIGRATION_TIMESTAMP);

      const rollbackSignal = new Error("rollback isolated catalog test data");
      try {
        await drizzle(postgresClient).transaction(async (transaction) => {
          await exerciseCatalog(transaction);
          throw rollbackSignal;
        });
      } catch (error) {
        if (error !== rollbackSignal) {
          throw error;
        }
      }
    } finally {
      await postgresClient.end({ timeout: 5 });
    }
  }
);
