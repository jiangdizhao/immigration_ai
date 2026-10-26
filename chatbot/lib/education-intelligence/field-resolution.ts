import {
  type ClaimDomain,
  type EducationDataset,
  type EducationFieldObservation,
  type EducationFieldResolution,
  type EducationFieldValue,
  type EducationSnapshot,
  type EducationSource,
  FIELD_DEFINITIONS,
  type FieldKey,
  type ResolutionReason,
  type ResolutionSourceRef,
  type ResolutionStatus,
  validateEducationDataset,
} from "./contracts";

export class EducationContractError extends Error {
  readonly issues: readonly {
    readonly code: string;
    readonly path: string;
    readonly message: string;
  }[];

  constructor(message: string, issues: EducationContractError["issues"] = []) {
    super(message);
    this.name = "EducationContractError";
    this.issues = issues;
  }
}

export interface ResolveFieldOptions {
  /** Absolute timestamp used for deterministic assessment; it must include a timezone. */
  readonly assessedAt: string;
  /** Explicit source-local calendar date used for date-only applicability boundaries. */
  readonly assessmentDate: string;
  /** Freshness is opt-in and field-specific; absent policy does not invent a freshness window. */
  readonly maxAgeMsByField?: Partial<Record<FieldKey, number>>;
}

interface CandidateState {
  readonly observation: EducationFieldObservation;
  readonly source: EducationSource;
  readonly snapshot: EducationSnapshot;
  readonly staleReason?:
    | "FRESHNESS_WINDOW_EXCEEDED"
    | "SOURCE_EFFECTIVITY_ENDED"
    | "LATEST_SOURCE_ATTEMPT_FAILED";
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
}

function dateBoundaryCompare(
  sourceDate: string,
  assessedAt: string,
  assessmentDate: string
): -1 | 0 | 1 {
  if (!sourceDate.includes("T")) {
    if (sourceDate < assessmentDate) {
      return -1;
    }
    if (sourceDate > assessmentDate) {
      return 1;
    }
    return 0;
  }
  const left = Date.parse(sourceDate);
  const right = Date.parse(assessedAt);
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function sourceClaimDomainAllowed(
  source: EducationSource,
  domain: ClaimDomain
): boolean {
  if (source.sourceFamily === "CRICOS") {
    return domain === "CRICOS_REGISTRATION";
  }
  if (source.sourceFamily === "STUDY_AUSTRALIA") {
    return domain === "DISCOVERY";
  }
  return domain.startsWith("INSTITUTION_");
}

function stableValueKey(value: EducationFieldValue): string {
  if (value.kind === "text") {
    return `text:${value.value.normalize("NFKC").trim().replace(/\s+/gu, " ")}`;
  }
  if (value.kind === "enum") {
    return `enum:${value.value.normalize("NFKC").trim().toUpperCase()}`;
  }
  if (value.kind === "boolean") {
    return `boolean:${String(value.value)}`;
  }
  if (value.kind === "date") {
    return `date:${value.value}`;
  }
  const scope = moneyScopeKey(value);
  return scope === null
    ? `money-unscoped:${String(value.amount)}`
    : `money:${scope}:${String(value.amount)}`;
}

function moneyScopeKey(
  value: Extract<EducationFieldValue, { readonly kind: "money" }>
): string | null {
  if (
    !value.currency ||
    !value.audience ||
    !value.basis ||
    value.year === undefined ||
    value.inclusions === undefined
  ) {
    return null;
  }
  if ((value.basis === "SEMESTER" || value.basis === "UNIT") && !value.period) {
    return null;
  }
  const inclusions = value.inclusions
    .map((item) =>
      item.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase()
    )
    .sort()
    .join(",");
  return [
    value.currency,
    value.audience,
    value.basis,
    String(value.year),
    value.period?.normalize("NFKC").trim().toLowerCase() ?? "",
    inclusions,
  ].join("|");
}

function valuesEqual(values: readonly EducationFieldValue[]): boolean {
  if (values.length < 2) {
    return true;
  }
  const first = values[0];
  if (first.kind === "money") {
    const firstScope = moneyScopeKey(first);
    if (firstScope === null) {
      return false;
    }
    return values.every(
      (value) =>
        value.kind === "money" &&
        moneyScopeKey(value) === firstScope &&
        value.amount === first.amount
    );
  }
  const firstKey = stableValueKey(first);
  return values.every((value) => stableValueKey(value) === firstKey);
}

function feeScopesCompatible(values: readonly EducationFieldValue[]): boolean {
  if (!values.some((value) => value.kind === "money")) {
    return true;
  }
  if (!values.every((value) => value.kind === "money")) {
    return false;
  }
  const keys = values.map((value) => moneyScopeKey(value));
  return keys.every((key) => key !== null && key === keys[0]);
}

function currentDispositionCandidates(
  states: readonly CandidateState[]
): readonly CandidateState[] {
  const grouped = new Map<string, CandidateState[]>();
  for (const state of states) {
    const sourceId = state.observation.provenance.sourceId;
    const group = grouped.get(sourceId) ?? [];
    group.push(state);
    grouped.set(sourceId, group);
  }
  const candidates: CandidateState[] = [];
  for (const group of grouped.values()) {
    const assertions = group.filter(
      (state) => state.observation.disposition === "ASSERTION"
    );
    const dispositions = group.filter(
      (state) => state.observation.disposition !== "ASSERTION"
    );
    if (dispositions.length === 0) {
      candidates.push(...assertions);
      continue;
    }
    const latestDispositionTime = Math.max(
      ...dispositions.map((state) => Date.parse(state.observation.observedAt))
    );
    const latestDispositions = dispositions.filter(
      (state) =>
        Date.parse(state.observation.observedAt) === latestDispositionTime
    );
    const laterAssertions = assertions.filter(
      (state) =>
        Date.parse(state.observation.observedAt) > latestDispositionTime
    );
    if (laterAssertions.length > 0) {
      candidates.push(...laterAssertions);
    } else {
      candidates.push(
        ...latestDispositions,
        ...assertions.filter(
          (state) =>
            Date.parse(state.observation.observedAt) === latestDispositionTime
        )
      );
    }
  }
  candidates.sort((a, b) => {
    const timeDifference =
      Date.parse(a.observation.observedAt) -
      Date.parse(b.observation.observedAt);
    if (timeDifference !== 0) {
      return timeDifference;
    }
    return a.observation.observationId.localeCompare(
      b.observation.observationId
    );
  });
  return candidates;
}

function failedLatestSourceAttempts(
  states: readonly CandidateState[],
  snapshots: readonly EducationSnapshot[]
): Set<string> {
  const sourceIds = new Set(
    states.map((state) => state.observation.provenance.sourceId)
  );
  const failed = new Set<string>();
  for (const sourceId of sourceIds) {
    const attempts = snapshots
      .filter((snapshot) => snapshot.sourceId === sourceId)
      .sort((a, b) => Date.parse(a.retrievedAt) - Date.parse(b.retrievedAt));
    const latestAttempt = attempts.at(-1);
    if (!latestAttempt) {
      continue;
    }
    const latestTime = Date.parse(latestAttempt.retrievedAt);
    const sameTimeAttempts = attempts.filter(
      (snapshot) => Date.parse(snapshot.retrievedAt) === latestTime
    );
    if (
      !sameTimeAttempts.some(
        (snapshot) => snapshot.acquisitionOutcome !== "CAPTURED"
      )
    ) {
      continue;
    }
    const latestFieldObservation = states
      .filter((state) => state.observation.provenance.sourceId === sourceId)
      .map((state) => state.snapshot)
      .sort((a, b) => Date.parse(a.retrievedAt) - Date.parse(b.retrievedAt))
      .at(-1);
    if (
      latestFieldObservation &&
      latestTime >= Date.parse(latestFieldObservation.retrievedAt)
    ) {
      failed.add(sourceId);
    }
  }
  return failed;
}

function buildSourceRefs(
  states: readonly CandidateState[]
): readonly ResolutionSourceRef[] {
  const refs = new Map<string, ResolutionSourceRef>();
  for (const state of states) {
    const observation = state.observation;
    refs.set(observation.observationId, {
      observationId: observation.observationId,
      sourceId: observation.provenance.sourceId,
      snapshotId: observation.provenance.snapshotId,
      sourceFamily: observation.provenance.sourceFamily,
      sourceUrl: observation.provenance.sourceUrl,
      contentSha256: observation.provenance.contentSha256,
      locator: observation.provenance.locator,
    });
  }
  return [...refs.values()].sort((a, b) =>
    a.observationId.localeCompare(b.observationId)
  );
}

function resolution(input: {
  readonly target: EducationFieldResolution["target"];
  readonly fieldKey: FieldKey;
  readonly assessedAt: string;
  readonly status: ResolutionStatus;
  readonly evidenceClass: EducationFieldResolution["evidenceClass"];
  readonly reasons: readonly ResolutionReason[];
  readonly states: readonly CandidateState[];
  readonly sourceSnapshotHistory: readonly EducationSnapshot[];
  readonly resolvedValue?: EducationFieldValue;
  readonly historicalValue?: EducationFieldValue;
}): EducationFieldResolution {
  const history = input.states
    .map((state) => state.observation)
    .sort((a, b) => {
      const timeDifference =
        Date.parse(a.observedAt) - Date.parse(b.observedAt);
      if (timeDifference !== 0) {
        return timeDifference;
      }
      return a.observationId.localeCompare(b.observationId);
    });
  return {
    target: input.target,
    fieldKey: input.fieldKey,
    status: input.status,
    evidenceClass: input.evidenceClass,
    assessedAt: input.assessedAt,
    ...(input.resolvedValue === undefined
      ? {}
      : { resolvedValue: input.resolvedValue }),
    ...(input.historicalValue === undefined
      ? {}
      : { historicalValue: input.historicalValue }),
    reasons: input.reasons,
    sourceRefs: buildSourceRefs(input.states),
    history,
    sourceSnapshotHistory: input.sourceSnapshotHistory,
  };
}

export function resolveEducationField(
  dataset: EducationDataset,
  target: EducationFieldResolution["target"],
  fieldKey: FieldKey,
  options: ResolveFieldOptions
): EducationFieldResolution {
  if (!options || typeof options !== "object") {
    throw new EducationContractError("Field resolution options are required.");
  }
  if (
    !target ||
    !["PROVIDER", "COURSE", "DELIVERY", "INTAKE"].includes(target.type) ||
    typeof target.id !== "string" ||
    !FIELD_DEFINITIONS[fieldKey]
  ) {
    throw new EducationContractError(
      "Field resolution requires a supported field and exact entity identity."
    );
  }
  if (!FIELD_DEFINITIONS[fieldKey].entityTypes.includes(target.type)) {
    throw new EducationContractError(
      "Field does not belong to the requested entity type."
    );
  }
  if (
    !isTimestamp(options.assessedAt) ||
    !isCalendarDate(options.assessmentDate)
  ) {
    throw new EducationContractError(
      "Assessment time must include a timezone and an explicit calendar date."
    );
  }
  if (options.maxAgeMsByField) {
    for (const age of Object.values(options.maxAgeMsByField)) {
      if (
        age !== undefined &&
        (typeof age !== "number" || !Number.isFinite(age) || age < 0)
      ) {
        throw new EducationContractError(
          "Freshness windows must be non-negative finite durations."
        );
      }
    }
  }
  const validation = validateEducationDataset(dataset);
  if (!validation.ok) {
    throw new EducationContractError(
      "Education dataset failed structural validation.",
      validation.issues
    );
  }
  const targetExists =
    target.type === "PROVIDER"
      ? dataset.providers.some((record) => record.providerId === target.id)
      : target.type === "COURSE"
        ? dataset.courses.some((record) => record.courseId === target.id)
        : target.type === "DELIVERY"
          ? dataset.deliveries.some((record) => record.deliveryId === target.id)
          : dataset.intakes.some((record) => record.intakeId === target.id);
  if (!targetExists) {
    throw new EducationContractError("Field resolution target does not exist.");
  }

  const matchingObservations = dataset.observations.filter(
    (observation) =>
      observation.target.type === target.type &&
      observation.target.id === target.id &&
      observation.fieldKey === fieldKey
  );
  if (matchingObservations.length > 32) {
    throw new EducationContractError(
      "Field candidate count exceeds its configured bound."
    );
  }
  const sourceById = new Map(
    dataset.sources.map((source) => [source.sourceId, source])
  );
  const snapshotById = new Map(
    dataset.snapshots.map((snapshot) => [snapshot.snapshotId, snapshot])
  );
  const matchingSourceIds = new Set(
    matchingObservations.map((observation) => observation.provenance.sourceId)
  );
  const sourceSnapshotHistory = dataset.snapshots
    .filter((snapshot) => matchingSourceIds.has(snapshot.sourceId))
    .sort((a, b) => {
      const timeDifference =
        Date.parse(a.retrievedAt) - Date.parse(b.retrievedAt);
      if (timeDifference !== 0) {
        return timeDifference;
      }
      return a.snapshotId.localeCompare(b.snapshotId);
    });
  const states: CandidateState[] = matchingObservations.map((observation) => ({
    observation,
    source: sourceById.get(observation.provenance.sourceId) as EducationSource,
    snapshot: snapshotById.get(
      observation.provenance.snapshotId
    ) as EducationSnapshot,
  }));
  const evidenceClass = states.some(
    (state) => state.source.recordClass === "UNVERIFIED"
  )
    ? "UNVERIFIED"
    : "SYNTHETIC_ONLY";

  if (states.length === 0) {
    return resolution({
      target,
      fieldKey,
      assessedAt: options.assessedAt,
      status: "UNKNOWN",
      evidenceClass: "UNVERIFIED",
      reasons: ["NO_OBSERVATIONS"],
      states,
      sourceSnapshotHistory: [],
    });
  }

  const sourceIdsWithFailedAttempts = failedLatestSourceAttempts(
    states,
    dataset.snapshots
  );
  const activeStates: CandidateState[] = [];
  const staleStates: CandidateState[] = [];
  const futureStates: CandidateState[] = [];
  for (const state of states) {
    const observation = state.observation;
    if (!sourceClaimDomainAllowed(state.source, observation.claimDomain)) {
      continue;
    }
    if (Date.parse(observation.observedAt) > Date.parse(options.assessedAt)) {
      futureStates.push(state);
      continue;
    }
    if (
      state.snapshot.effectiveFrom &&
      dateBoundaryCompare(
        state.snapshot.effectiveFrom,
        options.assessedAt,
        options.assessmentDate
      ) > 0
    ) {
      futureStates.push(state);
      continue;
    }
    if (
      state.snapshot.effectiveTo &&
      dateBoundaryCompare(
        state.snapshot.effectiveTo,
        options.assessedAt,
        options.assessmentDate
      ) < 0
    ) {
      staleStates.push({ ...state, staleReason: "SOURCE_EFFECTIVITY_ENDED" });
      continue;
    }
    if (
      observation.effectiveFrom &&
      dateBoundaryCompare(
        observation.effectiveFrom,
        options.assessedAt,
        options.assessmentDate
      ) > 0
    ) {
      futureStates.push(state);
      continue;
    }
    if (
      observation.effectiveTo &&
      dateBoundaryCompare(
        observation.effectiveTo,
        options.assessedAt,
        options.assessmentDate
      ) < 0
    ) {
      staleStates.push({ ...state, staleReason: "SOURCE_EFFECTIVITY_ENDED" });
      continue;
    }
    const maxAge = options.maxAgeMsByField?.[fieldKey];
    if (
      maxAge !== undefined &&
      Date.parse(options.assessedAt) - Date.parse(observation.observedAt) >
        maxAge
    ) {
      staleStates.push({ ...state, staleReason: "FRESHNESS_WINDOW_EXCEEDED" });
      continue;
    }
    if (sourceIdsWithFailedAttempts.has(observation.provenance.sourceId)) {
      staleStates.push({
        ...state,
        staleReason: "LATEST_SOURCE_ATTEMPT_FAILED",
      });
      continue;
    }
    activeStates.push(state);
  }

  const currentStates = currentDispositionCandidates(activeStates);

  const assertions = currentStates.filter(
    (state) => state.observation.disposition === "ASSERTION"
  );
  const withdrawals = currentStates.filter(
    (state) => state.observation.disposition === "WITHDRAWAL"
  );
  const notApplicable = currentStates.filter(
    (state) => state.observation.disposition === "NOT_APPLICABLE"
  );
  const provenanceStates = states;

  if (evidenceClass === "UNVERIFIED") {
    return resolution({
      target,
      fieldKey,
      assessedAt: options.assessedAt,
      status: "UNKNOWN",
      evidenceClass,
      reasons: ["SOURCE_NOT_VERIFIED"],
      states: provenanceStates,
      sourceSnapshotHistory,
    });
  }

  if (
    (assertions.length > 0 &&
      (withdrawals.length > 0 || notApplicable.length > 0)) ||
    (withdrawals.length > 0 && notApplicable.length > 0)
  ) {
    return resolution({
      target,
      fieldKey,
      assessedAt: options.assessedAt,
      status: "CONFLICTED",
      evidenceClass,
      reasons: ["CONFLICTING_DISPOSITIONS"],
      states: provenanceStates,
      sourceSnapshotHistory,
    });
  }

  if (
    assertions.length === 0 &&
    withdrawals.length > 0 &&
    notApplicable.length === 0
  ) {
    return resolution({
      target,
      fieldKey,
      assessedAt: options.assessedAt,
      status: "WITHDRAWN",
      evidenceClass,
      reasons: ["ALL_SOURCES_WITHDREW_FIELD"],
      states: provenanceStates,
      sourceSnapshotHistory,
    });
  }
  if (
    assertions.length === 0 &&
    notApplicable.length > 0 &&
    withdrawals.length === 0
  ) {
    return resolution({
      target,
      fieldKey,
      assessedAt: options.assessedAt,
      status: "NOT_APPLICABLE",
      evidenceClass,
      reasons: ["ALL_SOURCES_MARKED_NOT_APPLICABLE"],
      states: provenanceStates,
      sourceSnapshotHistory,
    });
  }

  if (assertions.length === 0 && staleStates.length > 0) {
    const staleAssertions = staleStates.filter(
      (state) => state.observation.disposition === "ASSERTION"
    );
    const staleValues = staleAssertions.map(
      (state) => state.observation.value as EducationFieldValue
    );
    const reasons = [
      ...new Set(staleStates.map((state) => state.staleReason).filter(Boolean)),
    ] as ResolutionReason[];
    const historicalValue =
      staleValues.length > 0 && valuesEqual(staleValues)
        ? staleValues.at(-1)
        : undefined;
    return resolution({
      target,
      fieldKey,
      assessedAt: options.assessedAt,
      status: "STALE",
      evidenceClass,
      reasons:
        reasons.length > 0 ? reasons : ["NO_CURRENT_APPLICABLE_OBSERVATIONS"],
      states: provenanceStates,
      sourceSnapshotHistory,
      ...(historicalValue === undefined ? {} : { historicalValue }),
    });
  }

  if (assertions.length === 0) {
    return resolution({
      target,
      fieldKey,
      assessedAt: options.assessedAt,
      status: "UNKNOWN",
      evidenceClass,
      reasons:
        futureStates.length > 0
          ? ["FUTURE_OBSERVATION"]
          : ["NO_CURRENT_APPLICABLE_OBSERVATIONS"],
      states: provenanceStates,
      sourceSnapshotHistory,
    });
  }

  const values = assertions.map(
    (state) => state.observation.value as EducationFieldValue
  );
  if (!feeScopesCompatible(values)) {
    return resolution({
      target,
      fieldKey,
      assessedAt: options.assessedAt,
      status: "UNKNOWN",
      evidenceClass,
      reasons: ["INCOMPATIBLE_FEE_SCOPE"],
      states: provenanceStates,
      sourceSnapshotHistory,
    });
  }
  if (!valuesEqual(values)) {
    return resolution({
      target,
      fieldKey,
      assessedAt: options.assessedAt,
      status: "CONFLICTED",
      evidenceClass,
      reasons: ["CONFLICTING_VALUES"],
      states: provenanceStates,
      sourceSnapshotHistory,
    });
  }

  return resolution({
    target,
    fieldKey,
    assessedAt: options.assessedAt,
    status: "KNOWN",
    evidenceClass,
    reasons: ["RESOLVED_IDENTICAL_VALUES"],
    states: provenanceStates,
    sourceSnapshotHistory,
    resolvedValue: values[0],
  });
}
