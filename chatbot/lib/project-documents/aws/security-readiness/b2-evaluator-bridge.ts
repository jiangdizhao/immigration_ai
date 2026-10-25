import "server-only";

import { isB2Observation } from "./b2-validation";
import { evaluateProjectDocumentAwsSecurityEvidence } from "./evaluator";
import { PROJECT_DOCUMENT_AWS_SECURITY_EVIDENCE_SCHEMA } from "./types";

/**
 * Runs the accepted B1 static evaluator only when observation and snapshot
 * provenance agree. Its result remains static and unconditional NO_GO.
 */
export function evaluateB2SnapshotWithB1(
  observationInput: unknown,
  snapshot: unknown
) {
  if (!isB2Observation(observationInput)) {
    throw new Error("B2_OBSERVATION_INVALID");
  }
  let schema: unknown;
  let source: unknown;
  try {
    if (
      typeof snapshot !== "object" ||
      snapshot === null ||
      Array.isArray(snapshot) ||
      (Object.getPrototypeOf(snapshot) !== Object.prototype &&
        Object.getPrototypeOf(snapshot) !== null)
    ) {
      throw new Error("B1_STATIC_SNAPSHOT_INVALID");
    }
    const schemaDescriptor = Object.getOwnPropertyDescriptor(
      snapshot,
      "schema"
    );
    const sourceDescriptor = Object.getOwnPropertyDescriptor(
      snapshot,
      "source"
    );
    if (
      !schemaDescriptor ||
      !Object.hasOwn(schemaDescriptor, "value") ||
      !sourceDescriptor ||
      !Object.hasOwn(sourceDescriptor, "value")
    ) {
      throw new Error("B1_STATIC_SNAPSHOT_INVALID");
    }
    schema = schemaDescriptor.value;
    source = sourceDescriptor.value;
  } catch {
    throw new Error("B1_STATIC_SNAPSHOT_INVALID");
  }
  if (schema !== PROJECT_DOCUMENT_AWS_SECURITY_EVIDENCE_SCHEMA) {
    throw new Error("B1_STATIC_SNAPSHOT_INVALID");
  }
  if (
    (observationInput.source === "fixture" && source !== "fixture") ||
    (observationInput.source === "live_operator_readonly" &&
      source !== "operator_export")
  ) {
    throw new Error("B2_B1_PROVENANCE_MISMATCH");
  }
  return evaluateProjectDocumentAwsSecurityEvidence(snapshot);
}
