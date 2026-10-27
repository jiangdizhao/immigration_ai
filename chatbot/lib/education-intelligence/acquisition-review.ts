import type { EducationAcquisitionAttempt } from "./acquisition-core";
import type {
  EducationDataset,
  EducationEntityType,
  EducationFieldObservation,
  EducationSnapshot,
  EducationSource,
  FieldKey,
  ResolutionStatus,
} from "./contracts";
import { FIELD_DEFINITIONS, validateEducationDataset } from "./contracts";
import { resolveEducationField } from "./field-resolution";
import {
  courseExternalIdentityKey,
  deliveryExternalIdentityKey,
  findCourseIdentityCollisions,
  findDeliveryIdentityCollisions,
  findIntakeIdentityCollisions,
  findProviderIdentityCollisions,
  findSourceIdentityCollisions,
  intakeExternalIdentityKey,
} from "./identity";

export type ReviewFieldStatus =
  | "UNKNOWN"
  | "CANDIDATES_PENDING_REVIEW"
  | "CONFLICTED_CANDIDATES"
  | "STALE"
  | "CONFLICTED";

export interface DryRunRecordChange {
  readonly table: "sources" | "snapshots" | "observations";
  readonly id: string;
  readonly disposition: "INSERT" | "REPLAY" | "CONFLICT";
  readonly reason?: "IDENTITY_CONTENT_MISMATCH" | "DATASET_VALIDATION_FAILED";
}

export interface AcquisitionReviewPacket {
  readonly schema: "education.source-acquisition-review.v1";
  readonly attempt: EducationAcquisitionAttempt;
  readonly proposed: {
    readonly source?: EducationSource;
    readonly snapshot?: EducationSnapshot;
    readonly observations: readonly EducationFieldObservation[];
  };
  readonly validation: ReturnType<typeof validateEducationDataset>;
  readonly fieldSignals: readonly {
    readonly target: {
      readonly type: EducationEntityType;
      readonly id: string;
    };
    readonly fieldKey: FieldKey;
    readonly status: ReviewFieldStatus;
    readonly resolverStatus: ResolutionStatus;
    readonly candidateObservationIds: readonly string[];
  }[];
  readonly identityWarnings: readonly string[];
  readonly writePreview: {
    readonly changes: readonly DryRunRecordChange[];
    readonly insertCount: number;
    readonly replayCount: number;
    readonly conflictCount: number;
  };
  readonly sideEffects: {
    readonly networkRequestsByReview: 0;
    readonly databaseWritesByReview: 0;
  };
}

function canonical(value: unknown): unknown {
  if (value === undefined || value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)])
    );
  }
  return value;
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function getId(
  table: DryRunRecordChange["table"],
  row: EducationSource | EducationSnapshot | EducationFieldObservation
): string {
  if (table === "sources") {
    return (row as EducationSource).sourceId;
  }
  if (table === "snapshots") {
    return (row as EducationSnapshot).snapshotId;
  }
  return (row as EducationFieldObservation).observationId;
}

function changesFor(
  table: DryRunRecordChange["table"],
  proposed: readonly (
    | EducationSource
    | EducationSnapshot
    | EducationFieldObservation
  )[],
  existing: readonly (
    | EducationSource
    | EducationSnapshot
    | EducationFieldObservation
  )[]
): readonly DryRunRecordChange[] {
  const byId = new Map(existing.map((row) => [getId(table, row), row]));
  return proposed.map((row) => {
    const id = getId(table, row);
    const old = byId.get(id);
    return {
      table,
      id,
      disposition:
        old === undefined ? "INSERT" : equal(old, row) ? "REPLAY" : "CONFLICT",
    };
  });
}

function mergeUnique<T>(
  rows: readonly T[],
  additions: readonly T[],
  getKey: (row: T) => string
): readonly T[] {
  const merged = [...rows];
  const ids = new Set(rows.map(getKey));
  for (const row of additions) {
    const id = getKey(row);
    if (!ids.has(id)) {
      ids.add(id);
      merged.push(row);
    }
  }
  return merged;
}

function candidateValuesConflict(
  group: readonly EducationFieldObservation[]
): boolean {
  if (group.length < 2) {
    return false;
  }
  const values = group.map((item) => item.value);
  if (values.every((value) => value?.kind === "money")) {
    const amountsByScope = new Map<string, Set<number>>();
    for (const value of values) {
      if (
        value?.kind !== "money" ||
        !value.currency ||
        !value.audience ||
        !value.basis ||
        value.year === undefined
      ) {
        continue;
      }
      const scope = JSON.stringify([
        value.currency,
        value.audience,
        value.basis,
        value.year,
        value.period ?? "",
        [...(value.inclusions ?? [])].sort(),
      ]);
      const amounts = amountsByScope.get(scope) ?? new Set<number>();
      amounts.add(value.amount);
      amountsByScope.set(scope, amounts);
    }
    return [...amountsByScope.values()].some((amounts) => amounts.size > 1);
  }
  return (
    new Set(values.map((value) => JSON.stringify(canonical(value)))).size > 1
  );
}

function identityWarnings(dataset: EducationDataset): readonly string[] {
  const warnings: string[] = [];
  const addCollisions = (
    prefix: string,
    rows: readonly { path: string; message: string }[]
  ) => {
    for (const collision of rows) {
      warnings.push(`${prefix}:${collision.path}:${collision.message}`);
    }
  };
  addCollisions(
    "provider_identity_collision",
    findProviderIdentityCollisions(dataset.providers)
  );
  addCollisions(
    "course_identity_collision",
    findCourseIdentityCollisions(dataset.courses)
  );
  addCollisions(
    "delivery_identity_collision",
    findDeliveryIdentityCollisions(dataset.deliveries, dataset.courses)
  );
  addCollisions(
    "intake_identity_collision",
    findIntakeIdentityCollisions(
      dataset.intakes,
      dataset.deliveries,
      dataset.courses
    )
  );
  addCollisions(
    "source_identity_collision",
    findSourceIdentityCollisions(dataset.sources)
  );
  for (const course of dataset.courses) {
    const identity = courseExternalIdentityKey(course);
    if (identity.status === "AMBIGUOUS") {
      warnings.push(
        `course_identity_ambiguous:${course.courseId}:${identity.reason}`
      );
    }
  }
  for (const delivery of dataset.deliveries) {
    const course = dataset.courses.find(
      (item) => item.courseId === delivery.courseId
    );
    if (
      course &&
      deliveryExternalIdentityKey(delivery, course).status === "AMBIGUOUS"
    ) {
      warnings.push(`delivery_identity_ambiguous:${delivery.deliveryId}`);
    }
  }
  for (const intake of dataset.intakes) {
    const delivery = dataset.deliveries.find(
      (item) => item.deliveryId === intake.deliveryId
    );
    const course =
      delivery &&
      dataset.courses.find((item) => item.courseId === delivery.courseId);
    if (
      delivery &&
      course &&
      intakeExternalIdentityKey(intake, delivery, course).status === "AMBIGUOUS"
    ) {
      warnings.push(`intake_identity_ambiguous:${intake.intakeId}`);
    }
  }
  return warnings.slice(0, 500);
}

function fieldSignals(
  dataset: EducationDataset,
  observations: readonly EducationFieldObservation[],
  assessedAt: string,
  requestedFields: readonly {
    readonly target: {
      readonly type: EducationEntityType;
      readonly id: string;
    };
    readonly fieldKey: FieldKey;
  }[] = [],
  maxAgeMsByField?: Partial<Record<FieldKey, number>>
): AcquisitionReviewPacket["fieldSignals"] {
  const groups = new Map<string, EducationFieldObservation[]>();
  const requestedByKey = new Map(
    requestedFields.map((item) => [
      `${item.target.type}\u0000${item.target.id}\u0000${item.fieldKey}`,
      item,
    ])
  );
  const proposedKeys = new Set([
    ...observations.map(
      (observation) =>
        `${observation.target.type}\u0000${observation.target.id}\u0000${observation.fieldKey}`
    ),
    ...requestedByKey.keys(),
  ]);
  for (const observation of dataset.observations) {
    const key = `${observation.target.type}\u0000${observation.target.id}\u0000${observation.fieldKey}`;
    if (!proposedKeys.has(key)) {
      continue;
    }
    const items = groups.get(key) ?? [];
    items.push(observation);
    groups.set(key, items);
  }
  return [...proposedKeys]
    .map((key) => {
      const group = groups.get(key) ?? [];
      const first = group[0] ?? requestedByKey.get(key);
      if (!first) {
        return undefined;
      }
      const target = "target" in first ? first.target : undefined;
      const fieldKey = "fieldKey" in first ? first.fieldKey : undefined;
      if (!target || !fieldKey) {
        return undefined;
      }
      const conflicts = candidateValuesConflict(group);
      const current = resolveEducationField(dataset, target, fieldKey, {
        assessedAt,
        assessmentDate: assessedAt.slice(0, 10),
        ...(maxAgeMsByField ? { maxAgeMsByField } : {}),
      });
      const status: ReviewFieldStatus =
        group.length === 0
          ? current.status === "STALE"
            ? "STALE"
            : current.status === "CONFLICTED"
              ? "CONFLICTED"
              : "UNKNOWN"
          : conflicts
            ? "CONFLICTED_CANDIDATES"
            : current.status === "STALE"
              ? "STALE"
              : current.status === "CONFLICTED"
                ? "CONFLICTED"
                : "CANDIDATES_PENDING_REVIEW";
      return {
        target,
        fieldKey,
        status,
        resolverStatus: current.status,
        candidateObservationIds: group.map((item) => item.observationId).sort(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== undefined);
}

export function buildEducationAcquisitionReviewPacket(input: {
  readonly attempt: EducationAcquisitionAttempt;
  readonly baseDataset: EducationDataset;
  readonly assessedAt: string;
  readonly requestedFields?: readonly {
    readonly target: {
      readonly type: EducationEntityType;
      readonly id: string;
    };
    readonly fieldKey: FieldKey;
  }[];
  readonly maxAgeMsByField?: Partial<Record<FieldKey, number>>;
}): AcquisitionReviewPacket {
  const { attempt, baseDataset, assessedAt } = input;
  const proposedSources = attempt.source ? [attempt.source] : [];
  const proposedSnapshots = attempt.snapshot ? [attempt.snapshot] : [];
  const proposedObservations = attempt.candidateObservations;
  const merged: EducationDataset = {
    providers: baseDataset.providers,
    courses: baseDataset.courses,
    deliveries: baseDataset.deliveries,
    intakes: baseDataset.intakes,
    sources: mergeUnique(
      baseDataset.sources,
      proposedSources,
      (item) => item.sourceId
    ),
    snapshots: mergeUnique(
      baseDataset.snapshots,
      proposedSnapshots,
      (item) => item.snapshotId
    ),
    observations: mergeUnique(
      baseDataset.observations,
      proposedObservations,
      (item) => item.observationId
    ),
  };
  const validation = validateEducationDataset(merged);
  const rawChanges = [
    ...changesFor("sources", proposedSources, baseDataset.sources),
    ...changesFor("snapshots", proposedSnapshots, baseDataset.snapshots),
    ...changesFor(
      "observations",
      proposedObservations,
      baseDataset.observations
    ),
  ];
  const changes: readonly DryRunRecordChange[] = validation.ok
    ? rawChanges.map((change) =>
        change.disposition === "CONFLICT"
          ? { ...change, reason: "IDENTITY_CONTENT_MISMATCH" as const }
          : change
      )
    : rawChanges.map((change) => ({
        ...change,
        disposition: "CONFLICT" as const,
        reason: "DATASET_VALIDATION_FAILED" as const,
      }));
  return {
    schema: "education.source-acquisition-review.v1",
    attempt,
    proposed: {
      ...(attempt.source ? { source: attempt.source } : {}),
      ...(attempt.snapshot ? { snapshot: attempt.snapshot } : {}),
      observations: proposedObservations,
    },
    validation,
    fieldSignals: validation.ok
      ? fieldSignals(
          merged,
          proposedObservations,
          assessedAt,
          input.requestedFields,
          input.maxAgeMsByField
        )
      : [],
    identityWarnings: identityWarnings(merged),
    writePreview: {
      changes,
      insertCount: changes.filter((change) => change.disposition === "INSERT")
        .length,
      replayCount: changes.filter((change) => change.disposition === "REPLAY")
        .length,
      conflictCount: changes.filter(
        (change) => change.disposition === "CONFLICT"
      ).length,
    },
    sideEffects: { networkRequestsByReview: 0, databaseWritesByReview: 0 },
  };
}

export function acquisitionCandidateFields(
  observations: readonly EducationFieldObservation[]
): readonly FieldKey[] {
  return [...new Set(observations.map((item) => item.fieldKey))]
    .filter((field) => Boolean(FIELD_DEFINITIONS[field]))
    .sort();
}
