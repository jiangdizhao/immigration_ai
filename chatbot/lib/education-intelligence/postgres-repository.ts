// biome-ignore-all lint/suspicious/useAwait: Methods implement the asynchronous catalog port.
import "server-only";

import { and, eq, inArray, or } from "drizzle-orm";
import { getLazyDatabase } from "@/lib/db/runtime-client";
import {
  educationCourse,
  educationDelivery,
  educationFieldObservation,
  educationIntake,
  educationProvider,
  educationSnapshot,
  educationSource,
} from "@/lib/db/schema";
import {
  type EducationCatalogEntityTable,
  type EducationCatalogQuery,
  EducationCatalogRepositoryCore,
  EducationCatalogRepositoryError,
  type EducationCatalogRowMap,
  type EducationCatalogStore,
  type EducationCatalogStoredRow,
  type EducationCatalogTable,
  type EducationCatalogTransaction,
} from "./catalog-repository-core";

type Database = ReturnType<typeof getLazyDatabase>;
type TransactionHost = Pick<Database, "transaction">;
type Transaction = Parameters<Parameters<TransactionHost["transaction"]>[0]>[0];

function postgresCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function tableForEntity(table: EducationCatalogEntityTable) {
  switch (table) {
    case "providers":
      return educationProvider;
    case "courses":
      return educationCourse;
    case "deliveries":
      return educationDelivery;
    case "intakes":
      return educationIntake;
    default:
      throw new Error("Unsupported Education catalog entity table.");
  }
}

function observationTargetPredicate(
  query: Extract<
    EducationCatalogQuery,
    { readonly kind: "observations_for_target" }
  >
) {
  switch (query.target.type) {
    case "PROVIDER":
      return and(
        eq(educationFieldObservation.targetType, "PROVIDER"),
        eq(educationFieldObservation.providerTargetId, query.target.id)
      );
    case "COURSE":
      return and(
        eq(educationFieldObservation.targetType, "COURSE"),
        eq(educationFieldObservation.courseTargetId, query.target.id)
      );
    case "DELIVERY":
      return and(
        eq(educationFieldObservation.targetType, "DELIVERY"),
        eq(educationFieldObservation.deliveryTargetId, query.target.id)
      );
    case "INTAKE":
      return and(
        eq(educationFieldObservation.targetType, "INTAKE"),
        eq(educationFieldObservation.intakeTargetId, query.target.id)
      );
    default:
      throw new Error("Unsupported Education catalog target type.");
  }
}

function targetFieldPredicate(
  target: Extract<
    EducationCatalogQuery,
    { readonly kind: "observations_for_target_fields" }
  >["targetFields"][number]
) {
  switch (target.target.type) {
    case "PROVIDER":
      return and(
        eq(educationFieldObservation.targetType, "PROVIDER"),
        eq(educationFieldObservation.providerTargetId, target.target.id),
        eq(educationFieldObservation.fieldKey, target.fieldKey)
      );
    case "COURSE":
      return and(
        eq(educationFieldObservation.targetType, "COURSE"),
        eq(educationFieldObservation.courseTargetId, target.target.id),
        eq(educationFieldObservation.fieldKey, target.fieldKey)
      );
    case "DELIVERY":
      return and(
        eq(educationFieldObservation.targetType, "DELIVERY"),
        eq(educationFieldObservation.deliveryTargetId, target.target.id),
        eq(educationFieldObservation.fieldKey, target.fieldKey)
      );
    case "INTAKE":
      return and(
        eq(educationFieldObservation.targetType, "INTAKE"),
        eq(educationFieldObservation.intakeTargetId, target.target.id),
        eq(educationFieldObservation.fieldKey, target.fieldKey)
      );
    default:
      throw new Error("Unsupported Education catalog target type.");
  }
}

class PostgresEducationCatalogStore implements EducationCatalogStore {
  private readonly database: TransactionHost;

  constructor(database: TransactionHost) {
    this.database = database;
  }

  async transaction<T>(
    operation: (transaction: EducationCatalogTransaction) => Promise<T>,
    options?: { readonly consistentRead?: boolean }
  ): Promise<T> {
    try {
      return await this.database.transaction(
        async (tx) => operation(this.unitOfWork(tx)),
        options?.consistentRead
          ? { isolationLevel: "repeatable read", accessMode: "read only" }
          : { isolationLevel: "read committed", accessMode: "read write" }
      );
    } catch (error) {
      const code = postgresCode(error);
      if (code?.startsWith("23")) {
        throw new EducationCatalogRepositoryError(
          "integrity_conflict",
          "Education catalog database integrity constraint rejected the transaction."
        );
      }
      throw error;
    }
  }

  private unitOfWork(tx: Transaction): EducationCatalogTransaction {
    return {
      insertIfAbsent: async (table, row) => {
        switch (table) {
          case "providers":
            return (
              (
                await tx
                  .insert(educationProvider)
                  .values(row as EducationCatalogRowMap["providers"])
                  .onConflictDoNothing()
                  .returning({ id: educationProvider.providerId })
              ).length > 0
            );
          case "courses":
            return (
              (
                await tx
                  .insert(educationCourse)
                  .values(row as EducationCatalogRowMap["courses"])
                  .onConflictDoNothing()
                  .returning({ id: educationCourse.courseId })
              ).length > 0
            );
          case "deliveries":
            return (
              (
                await tx
                  .insert(educationDelivery)
                  .values(row as EducationCatalogRowMap["deliveries"])
                  .onConflictDoNothing()
                  .returning({ id: educationDelivery.deliveryId })
              ).length > 0
            );
          case "intakes":
            return (
              (
                await tx
                  .insert(educationIntake)
                  .values(row as EducationCatalogRowMap["intakes"])
                  .onConflictDoNothing()
                  .returning({ id: educationIntake.intakeId })
              ).length > 0
            );
          case "sources":
            return (
              (
                await tx
                  .insert(educationSource)
                  .values(row as EducationCatalogRowMap["sources"])
                  .onConflictDoNothing()
                  .returning({ id: educationSource.sourceId })
              ).length > 0
            );
          case "snapshots":
            return (
              (
                await tx
                  .insert(educationSnapshot)
                  .values(row as EducationCatalogRowMap["snapshots"])
                  .onConflictDoNothing()
                  .returning({ id: educationSnapshot.snapshotId })
              ).length > 0
            );
          case "observations":
            return (
              (
                await tx
                  .insert(educationFieldObservation)
                  .values(row as EducationCatalogRowMap["observations"])
                  .onConflictDoNothing()
                  .returning({ id: educationFieldObservation.observationId })
              ).length > 0
            );
          default:
            throw new Error("Unsupported Education catalog table.");
        }
      },
      findById: async <K extends EducationCatalogTable>(
        table: K,
        id: string
      ): Promise<EducationCatalogRowMap[K] | undefined> => {
        let row: EducationCatalogStoredRow | undefined;
        switch (table) {
          case "providers":
            row = (
              await tx
                .select()
                .from(educationProvider)
                .where(eq(educationProvider.providerId, id))
                .limit(1)
            )[0] as EducationCatalogStoredRow | undefined;
            break;
          case "courses":
            row = (
              await tx
                .select()
                .from(educationCourse)
                .where(eq(educationCourse.courseId, id))
                .limit(1)
            )[0] as EducationCatalogStoredRow | undefined;
            break;
          case "deliveries":
            row = (
              await tx
                .select()
                .from(educationDelivery)
                .where(eq(educationDelivery.deliveryId, id))
                .limit(1)
            )[0] as EducationCatalogStoredRow | undefined;
            break;
          case "intakes":
            row = (
              await tx
                .select()
                .from(educationIntake)
                .where(eq(educationIntake.intakeId, id))
                .limit(1)
            )[0] as EducationCatalogStoredRow | undefined;
            break;
          case "sources":
            row = (
              await tx
                .select()
                .from(educationSource)
                .where(eq(educationSource.sourceId, id))
                .limit(1)
            )[0] as EducationCatalogStoredRow | undefined;
            break;
          case "snapshots":
            row = (
              await tx
                .select()
                .from(educationSnapshot)
                .where(eq(educationSnapshot.snapshotId, id))
                .limit(1)
            )[0] as EducationCatalogStoredRow | undefined;
            break;
          case "observations":
            row = (
              await tx
                .select()
                .from(educationFieldObservation)
                .where(eq(educationFieldObservation.observationId, id))
                .limit(1)
            )[0] as EducationCatalogStoredRow | undefined;
            break;
          default:
            throw new Error("Unsupported Education catalog table.");
        }
        return row as EducationCatalogRowMap[K] | undefined;
      },
      query: async (query) => this.query(tx, query),
    };
  }

  private async query(
    tx: Transaction,
    query: EducationCatalogQuery
  ): Promise<readonly EducationCatalogStoredRow[]> {
    switch (query.kind) {
      case "entity_ids": {
        if (query.ids.length === 0) {
          return [];
        }
        const table = tableForEntity(query.table);
        const idColumn =
          query.table === "providers"
            ? educationProvider.providerId
            : query.table === "courses"
              ? educationCourse.courseId
              : query.table === "deliveries"
                ? educationDelivery.deliveryId
                : educationIntake.intakeId;
        return (await tx
          .select()
          .from(table)
          .where(inArray(idColumn, [...query.ids]))
          .limit(query.limit)) as EducationCatalogStoredRow[];
      }
      case "source_ids": {
        if (query.ids.length === 0) {
          return [];
        }
        return (await tx
          .select()
          .from(educationSource)
          .where(inArray(educationSource.sourceId, [...query.ids]))
          .limit(query.limit)) as EducationCatalogStoredRow[];
      }
      case "snapshots_for_sources": {
        if (query.sourceIds.length === 0) {
          return [];
        }
        return (await tx
          .select()
          .from(educationSnapshot)
          .where(inArray(educationSnapshot.sourceId, [...query.sourceIds]))
          .limit(query.limit)) as EducationCatalogStoredRow[];
      }
      case "observations_for_target":
        return (await tx
          .select()
          .from(educationFieldObservation)
          .where(observationTargetPredicate(query))
          .limit(query.limit)) as EducationCatalogStoredRow[];
      case "observations_for_sources": {
        if (query.sourceIds.length === 0) {
          return [];
        }
        return (await tx
          .select()
          .from(educationFieldObservation)
          .where(
            inArray(educationFieldObservation.sourceId, [...query.sourceIds])
          )
          .limit(query.limit)) as EducationCatalogStoredRow[];
      }
      case "observations_for_target_fields": {
        const predicates = query.targetFields.map(targetFieldPredicate);
        if (!predicates.length) {
          return [];
        }
        return (await tx
          .select()
          .from(educationFieldObservation)
          .where(or(...predicates))
          .limit(query.limit)) as EducationCatalogStoredRow[];
      }
      default:
        throw new Error("Unsupported Education catalog query.");
    }
  }
}

/** No DB client is opened until the first method uses the lazy injected handle. */
export class PostgresEducationCatalogRepository extends EducationCatalogRepositoryCore {
  constructor(database: TransactionHost = getLazyDatabase()) {
    super(new PostgresEducationCatalogStore(database));
  }
}

export function createPostgresEducationCatalogRepository(
  database: TransactionHost
): PostgresEducationCatalogRepository {
  return new PostgresEducationCatalogRepository(database);
}

export type InjectedEducationCatalogDatabase = TransactionHost;
