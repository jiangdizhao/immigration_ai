/**
 * Phase 14-B Project basic-information view model.
 *
 * The API is the only authority: this module shapes/validates what the server returned and
 * builds request bodies. It never derives a fact value, never marks a fact verified and
 * never invents a label for an unknown key.
 */

export type ProjectFactRow = {
  assertionId: string;
  assertionVersion: number;
  key: string;
  valueType: string;
  value: string;
  originKind: string;
  state: string;
  sourceEvidenceRef: string | null;
  conflicts: boolean;
};

export type ProjectFactAiRow = {
  assertionId: string;
  assertionVersion: number;
  key: string;
  valueType: string;
  value: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  sourceEvidenceRef: string | null;
};

export type ProjectFactsView = {
  candidates: ProjectFactRow[];
  authorizedForAI: ProjectFactAiRow[];
  conflictCount: number;
  /** Candidates the customer can confirm or reject right now. */
  actionableCandidates: ProjectFactRow[];
  /** Candidates already confirmed whose AI use is not authorized yet. */
  confirmableForAI: ProjectFactRow[];
};

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : null;
}

function displayValue(value: unknown): string | null {
  if (typeof value === "string") {
    return boundedString(value, 512);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function parseRow(entry: unknown): ProjectFactRow | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }
  const record = entry as Record<string, unknown>;
  const assertionId = boundedString(record.assertionId, 80);
  const key = boundedString(record.key, 128);
  const value = displayValue(record.value);
  if (
    !assertionId ||
    !key ||
    value === null ||
    typeof record.assertionVersion !== "number" ||
    !Number.isSafeInteger(record.assertionVersion) ||
    record.assertionVersion < 1 ||
    typeof record.state !== "string"
  ) {
    return null;
  }
  return {
    assertionId,
    assertionVersion: record.assertionVersion,
    key,
    valueType:
      typeof record.valueType === "string" ? record.valueType : "string",
    value,
    originKind:
      typeof record.originKind === "string"
        ? record.originKind
        : "customer_stated",
    state: record.state,
    sourceEvidenceRef: boundedString(record.sourceEvidenceRef, 160),
    conflicts: record.conflicts === true,
  };
}

function parseAiRow(entry: unknown): ProjectFactAiRow | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }
  const record = entry as Record<string, unknown>;
  const assertionId = boundedString(record.assertionId, 80);
  const key = boundedString(record.key, 128);
  const value = displayValue(record.value);
  if (
    !assertionId ||
    !key ||
    value === null ||
    typeof record.assertionVersion !== "number" ||
    !Number.isSafeInteger(record.assertionVersion) ||
    record.assertionVersion < 1
  ) {
    return null;
  }
  return {
    assertionId,
    assertionVersion: record.assertionVersion,
    key,
    valueType:
      typeof record.valueType === "string" ? record.valueType : "string",
    value,
    effectiveFrom: boundedString(record.effectiveFrom, 40),
    effectiveTo: boundedString(record.effectiveTo, 40),
    sourceEvidenceRef: boundedString(record.sourceEvidenceRef, 160),
  };
}

/** Parse the `projection` object returned by the facts API. Unusable rows are dropped. */
export function parseProjectFactsProjection(
  payload: unknown
): ProjectFactsView | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (
    !Array.isArray(record.candidates) ||
    !Array.isArray(record.authorizedForAI)
  ) {
    return null;
  }
  const candidates = record.candidates
    .map(parseRow)
    .filter((row): row is ProjectFactRow => row !== null);
  const authorizedForAI = record.authorizedForAI
    .map(parseAiRow)
    .filter((row): row is ProjectFactAiRow => row !== null);
  const authorizedIds = new Set(
    authorizedForAI.map((row) => `${row.assertionId}:${row.assertionVersion}`)
  );
  return {
    candidates,
    authorizedForAI,
    conflictCount:
      typeof record.conflictCount === "number" &&
      Number.isSafeInteger(record.conflictCount) &&
      record.conflictCount >= 0
        ? record.conflictCount
        : 0,
    actionableCandidates: candidates.filter(
      (row) => row.state === "proposed" || row.state === "disputed"
    ),
    confirmableForAI: candidates.filter(
      (row) =>
        row.state === "customer_confirmed" &&
        !authorizedIds.has(`${row.assertionId}:${row.assertionVersion}`)
    ),
  };
}

export type FactActionBody =
  | {
      action: "confirm" | "reject" | "revoke_ai";
      operationId: string;
      items: Array<{ assertionId: string; assertionVersion: number }>;
    }
  | {
      action: "authorize_for_ai";
      operationId: string;
      items: Array<{ assertionId: string; assertionVersion: number }>;
      audience: "actor_only" | "project";
    }
  | {
      action: "correct";
      operationId: string;
      item: { assertionId: string; assertionVersion: number };
      key: string;
      valueType: "string" | "date";
      value: string;
    };

export function factItems(
  rows: readonly { assertionId: string; assertionVersion: number }[]
): Array<{ assertionId: string; assertionVersion: number }> {
  return rows.map((row) => ({
    assertionId: row.assertionId,
    assertionVersion: row.assertionVersion,
  }));
}

/** Items are always derived from server rows, never from user input. */
export function buildFactActionBody(input: {
  action: FactActionBody["action"];
  operationId: string;
  rows?: readonly { assertionId: string; assertionVersion: number }[];
  row?: { assertionId: string; assertionVersion: number };
  correction?: { key: string; valueType: "string" | "date"; value: string };
}): FactActionBody | null {
  if (input.action === "correct") {
    if (!(input.row && input.correction)) {
      return null;
    }
    if (
      input.correction.value.trim().length === 0 ||
      input.correction.value.length > 4096
    ) {
      return null;
    }
    return {
      action: "correct",
      operationId: input.operationId,
      item: {
        assertionId: input.row.assertionId,
        assertionVersion: input.row.assertionVersion,
      },
      key: input.correction.key,
      valueType: input.correction.valueType,
      value: input.correction.value.trim(),
    };
  }
  const rows = input.rows ?? [];
  if (rows.length === 0 || rows.length > 20) {
    return null;
  }
  const items = factItems(rows);
  if (input.action === "authorize_for_ai") {
    return {
      action: "authorize_for_ai",
      operationId: input.operationId,
      items,
      // The narrowest audience that still reaches this customer's own Chats.
      audience: "actor_only",
    };
  }
  return { action: input.action, operationId: input.operationId, items };
}
