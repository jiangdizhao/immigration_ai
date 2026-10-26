import "server-only";

import {
  type B2Observation,
  PROJECT_DOCUMENT_AWS_B2_OBSERVATION_SCHEMA,
} from "./b2-types";

function exactDataRecord(
  value: unknown,
  keys: string[]
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return false;
    }
    const actual = Reflect.ownKeys(value);
    return (
      actual.length === keys.length &&
      actual.every((key) => typeof key === "string" && keys.includes(key)) &&
      actual.every((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor !== undefined && Object.hasOwn(descriptor, "value");
      })
    );
  } catch {
    return false;
  }
}

function boundedText(
  value: unknown,
  maxLength: number,
  pattern?: RegExp
): value is string {
  if (typeof value !== "string") {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return false;
    }
  }
  return (
    value.length > 0 &&
    value.length <= maxLength &&
    value.trim() === value &&
    (pattern === undefined || pattern.test(value))
  );
}

function validTimestamp(value: unknown): value is string {
  return (
    boundedText(value, 64) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function boundedDataArray(value: unknown, maximum: number): unknown[] | null {
  if (!Array.isArray(value) || value.length > maximum) {
    return null;
  }
  try {
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== value.length + 1 ||
      keys.some(
        (key) =>
          typeof key !== "string" ||
          (key !== "length" &&
            (!/^\d+$/u.test(key) || Number(key) >= value.length))
      )
    ) {
      return null;
    }
    const entries: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, "value")) {
        return null;
      }
      entries.push(descriptor.value);
    }
    return entries;
  } catch {
    return null;
  }
}

export function isB2Observation(value: unknown): value is B2Observation {
  const findings = exactDataRecord(value, [
    "schema",
    "source",
    "scopeFingerprint",
    "findings",
    "liveDecision",
    "requiresLiveOwnerVerification",
    "limitation",
  ])
    ? boundedDataArray(value.findings, 128)
    : null;
  if (
    !exactDataRecord(value, [
      "schema",
      "source",
      "scopeFingerprint",
      "findings",
      "liveDecision",
      "requiresLiveOwnerVerification",
      "limitation",
    ]) ||
    value.schema !== PROJECT_DOCUMENT_AWS_B2_OBSERVATION_SCHEMA ||
    (value.source !== "fixture" && value.source !== "live_operator_readonly") ||
    value.liveDecision !== "NO_GO" ||
    value.requiresLiveOwnerVerification !== true ||
    (value.scopeFingerprint !== null &&
      !boundedText(value.scopeFingerprint, 64, /^[0-9a-f]{64}$/u)) ||
    !boundedText(value.limitation, 512) ||
    findings === null
  ) {
    return false;
  }
  return findings.every((finding) => {
    if (
      !exactDataRecord(finding, [
        "requirement",
        "source",
        "status",
        "reasonCode",
        "observedAt",
        "evidenceFingerprint",
        "outstandingAction",
      ])
    ) {
      return false;
    }
    return (
      boundedText(finding.requirement, 96, /^[a-z0-9_.:-]+$/u) &&
      (value.source === "fixture"
        ? finding.source === "plan" || finding.source === "fixture_executor"
        : finding.source === "live_executor") &&
      (finding.status === "PASS" ||
        finding.status === "FAIL" ||
        finding.status === "INCOMPLETE") &&
      boundedText(finding.reasonCode, 96, /^[A-Z0-9_]+$/u) &&
      validTimestamp(finding.observedAt) &&
      (finding.evidenceFingerprint === null ||
        boundedText(finding.evidenceFingerprint, 64, /^[0-9a-f]{64}$/u)) &&
      boundedText(finding.outstandingAction, 512)
    );
  });
}
