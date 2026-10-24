import { createHash } from "node:crypto";

export type ProjectFoundationErrorCode =
  | "invalid_operation_id"
  | "invalid_request"
  | "idempotency_conflict"
  | "project_not_found"
  | "project_forbidden"
  | "project_closed"
  | "revision_conflict"
  | "outcome_unavailable"
  | "integrity_conflict";

export class ProjectFoundationError extends Error {
  readonly code: ProjectFoundationErrorCode;

  constructor(code: ProjectFoundationErrorCode) {
    super(code);
    this.name = "ProjectFoundationError";
    this.code = code;
  }
}

export function validateProjectOperationId(value: string): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)
  ) {
    throw new ProjectFoundationError("invalid_operation_id");
  }
  return value;
}

function canonicalize(value: unknown, ancestors = new Set<object>()): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ProjectFoundationError("invalid_request");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new ProjectFoundationError("invalid_request");
    }
    const nextAncestors = new Set(ancestors).add(value);
    return `[${value
      .map((entry) => canonicalize(entry, nextAncestors))
      .join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (
      Object.getPrototypeOf(record) !== Object.prototype &&
      Object.getPrototypeOf(record) !== null
    ) {
      throw new ProjectFoundationError("invalid_request");
    }
    if (ancestors.has(record)) {
      throw new ProjectFoundationError("invalid_request");
    }
    const nextAncestors = new Set(ancestors).add(record);
    const keys = Object.keys(record).sort();
    return `{${keys
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalize(record[key], nextAncestors)}`
      )
      .join(",")}}`;
  }
  throw new ProjectFoundationError("invalid_request");
}

export function canonicalProjectOperationRequest(value: unknown): string {
  return canonicalize(value);
}

export function hashProjectOperationRequest(value: unknown): string {
  return createHash("sha256")
    .update(canonicalProjectOperationRequest(value), "utf8")
    .digest("hex");
}

export function resolveProjectOperationReplay(
  existing: {
    requestHash: string;
    resultId: string;
    resultKind: string;
  },
  expected: {
    requestHash: string;
    resultKind: "project" | "chat";
  }
) {
  if (
    existing.requestHash !== expected.requestHash ||
    existing.resultKind !== expected.resultKind
  ) {
    throw new ProjectFoundationError("idempotency_conflict");
  }
  return {
    resultId: existing.resultId,
    resultKind: existing.resultKind,
    replayed: true as const,
  };
}
