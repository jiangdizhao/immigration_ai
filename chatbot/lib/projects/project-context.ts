import type { ProjectFactAssertion } from "@/lib/project-facts/facts";

export type AuthorizedProjectFact = {
  assertionId: string;
  assertionVersion: number;
  key: string;
  valueType: "string" | "number" | "boolean" | "date" | "json";
  value: unknown;
  originKind:
    | "customer_stated"
    | "document_extracted"
    | "ai_inferred"
    | "professional_determination";
  confirmedByUserId: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  observedAt: string | null;
  sourceEvidenceRef: string | null;
  state: string;
  stale: boolean;
};

export type AuthorizedProjectDocumentEvidence = {
  evidenceRef: string;
  versionId: string;
  runId: string;
  mimeType: string;
  locator: Record<string, string | number>;
  excerpt: string;
  contentUntrusted: true;
};

export type ProjectContextPacket = {
  schemaVersion: "phase13.project-context.v1";
  contextOrigin: "project_chat";
  projectId: string;
  confirmedProjectFacts: Array<{
    assertionId: string;
    assertionVersion: number;
    key: string;
    valueType: AuthorizedProjectFact["valueType"];
    value: unknown;
    originKind: AuthorizedProjectFact["originKind"];
    confirmedByUserId: string;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    observedAt: string | null;
    sourceEvidenceRef: string | null;
    verificationLabel: "customer-confirmed; not independently verified";
  }>;
  documentEvidence: AuthorizedProjectDocumentEvidence[];
};

export const MAX_PROJECT_FACTS = 20;
export const MAX_PROJECT_FACT_BYTES = 2048;
export const MAX_PROJECT_PACKET_BYTES = 12_000;
export const MAX_PROJECT_DOCUMENT_EVIDENCE = 4;
export const MAX_PROJECT_DOCUMENT_EXCERPT_CHARS = 1500;

/** Map the persistence DTO while retaining stable-projection authorization. */
export function mapProjectFactAssertion(
  assertion: ProjectFactAssertion
): AuthorizedProjectFact {
  return {
    assertionId: assertion.id,
    assertionVersion: assertion.version,
    key: assertion.key,
    valueType: assertion.valueType,
    value: assertion.value,
    originKind: assertion.originKind,
    confirmedByUserId: assertion.confirmedByUserId,
    effectiveFrom: assertion.effectiveFrom,
    effectiveTo: assertion.effectiveTo,
    observedAt: assertion.observedAt,
    sourceEvidenceRef: assertion.sourceEvidenceRef,
    state: assertion.state,
    stale: assertion.stale,
  };
}

function serializedSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function boundedLocator(locator: Record<string, string | number>): boolean {
  const entries = Object.entries(locator);
  return (
    entries.length <= 8 &&
    entries.every(
      ([key, value]) =>
        key.length <= 64 &&
        (typeof value === "string"
          ? value.length <= 256
          : Number.isSafeInteger(value))
    )
  );
}

/**
 * Converts the service's authorization-filtered view into a small provider
 * packet. Candidates/conflict details are intentionally not accepted here.
 */
export function buildProjectContextPacket(input: {
  projectId: string;
  facts: readonly AuthorizedProjectFact[];
  documentEvidence: readonly AuthorizedProjectDocumentEvidence[];
}): ProjectContextPacket {
  const evidence = input.documentEvidence
    .filter(
      (item) =>
        item.contentUntrusted === true &&
        item.evidenceRef.length <= 160 &&
        item.versionId.length <= 255 &&
        item.runId.length <= 80 &&
        item.mimeType.length <= 120 &&
        boundedLocator(item.locator) &&
        item.evidenceRef.length > 0 &&
        item.versionId.length > 0 &&
        item.runId.length > 0 &&
        item.excerpt.trim().length > 0 &&
        item.excerpt.length <= MAX_PROJECT_DOCUMENT_EXCERPT_CHARS
    )
    .slice(0, MAX_PROJECT_DOCUMENT_EVIDENCE)
    .map((item) => ({ ...item }));
  const evidenceRefs = new Set(evidence.map((item) => item.evidenceRef));
  const facts: ProjectContextPacket["confirmedProjectFacts"] = [];
  const seen = new Set<string>();
  const orderedFacts = [...input.facts].sort(
    (left, right) =>
      left.key.localeCompare(right.key) ||
      left.assertionId.localeCompare(right.assertionId)
  );

  for (const fact of orderedFacts) {
    if (
      fact.state !== "customer_confirmed" ||
      fact.stale ||
      (fact.originKind !== "customer_stated" &&
        fact.originKind !== "document_extracted") ||
      !fact.confirmedByUserId ||
      !Number.isSafeInteger(fact.assertionVersion) ||
      fact.assertionVersion < 1 ||
      seen.has(fact.assertionId) ||
      (fact.sourceEvidenceRef !== null &&
        !evidenceRefs.has(fact.sourceEvidenceRef))
    ) {
      continue;
    }
    const candidate: ProjectContextPacket["confirmedProjectFacts"][number] = {
      assertionId: fact.assertionId,
      assertionVersion: fact.assertionVersion,
      key: fact.key,
      valueType: fact.valueType,
      value: fact.value,
      originKind: fact.originKind,
      confirmedByUserId: fact.confirmedByUserId,
      effectiveFrom: fact.effectiveFrom,
      effectiveTo: fact.effectiveTo,
      observedAt: fact.observedAt,
      sourceEvidenceRef: fact.sourceEvidenceRef,
      verificationLabel: "customer-confirmed; not independently verified",
    };
    if (
      serializedSize(candidate) > MAX_PROJECT_FACT_BYTES ||
      facts.length >= MAX_PROJECT_FACTS
    ) {
      continue;
    }
    facts.push(candidate);
    seen.add(fact.assertionId);
  }

  const packet: ProjectContextPacket = {
    schemaVersion: "phase13.project-context.v1",
    contextOrigin: "project_chat",
    projectId: input.projectId,
    confirmedProjectFacts: facts,
    documentEvidence: evidence,
  };
  while (
    serializedSize(packet) > MAX_PROJECT_PACKET_BYTES &&
    packet.confirmedProjectFacts.length
  ) {
    packet.confirmedProjectFacts.pop();
  }
  while (
    serializedSize(packet) > MAX_PROJECT_PACKET_BYTES &&
    packet.documentEvidence.length
  ) {
    packet.documentEvidence.pop();
  }
  return packet;
}

export function projectContextRequestPayload(
  packet: ProjectContextPacket | null
): Record<string, unknown> {
  if (!packet) {
    return {};
  }
  return {
    project_context: {
      schema_version: packet.schemaVersion,
      context_origin: packet.contextOrigin,
      project_id: packet.projectId,
      confirmed_project_facts: packet.confirmedProjectFacts.map((fact) => ({
        assertion_id: fact.assertionId,
        assertion_version: fact.assertionVersion,
        key: fact.key,
        value_type: fact.valueType,
        value: fact.value,
        origin_kind: fact.originKind,
        confirmed_by_user_id: fact.confirmedByUserId,
        effective_from: fact.effectiveFrom,
        effective_to: fact.effectiveTo,
        observed_at: fact.observedAt,
        source_evidence_ref: fact.sourceEvidenceRef,
        verification_label: fact.verificationLabel,
      })),
      document_evidence: packet.documentEvidence.map((evidence) => ({
        evidence_ref: evidence.evidenceRef,
        version_id: evidence.versionId,
        run_id: evidence.runId,
        mime_type: evidence.mimeType,
        locator: evidence.locator,
        excerpt: evidence.excerpt,
        content_untrusted: true,
      })),
    },
  };
}
