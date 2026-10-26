import { createHash } from "node:crypto";

export type FactOrigin =
  | "customer_stated"
  | "document_extracted"
  | "ai_inferred"
  | "professional_determination";
export type FactState =
  | "proposed"
  | "customer_confirmed"
  | "rejected"
  | "disputed"
  | "stale"
  | "superseded";
export type FactConflictKind = "conflict" | "possible_conflict";
export type FactAudience = "actor_only" | "project";

export type ProjectFactAssertion = {
  id: string;
  projectId: string;
  key: string;
  valueType: "string" | "number" | "boolean" | "date" | "json";
  value: unknown;
  normalizedComparison: string;
  originKind: FactOrigin;
  state: FactState;
  sourceEvidenceRef: string | null;
  createdByUserId: string;
  confirmedByUserId: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  observedAt: string | null;
  supersedesAssertionId: string | null;
  version: number;
  stale: boolean;
};

export type ProjectFactConflict = {
  id: string;
  projectId: string;
  leftAssertionId: string;
  rightAssertionId: string;
  kind: FactConflictKind;
  resolvedAt: string | null;
};

export type ProjectFactPublication = {
  assertionId: string;
  assertionVersion: number;
  actorUserId: string;
  audience: FactAudience;
  active: boolean;
};

export type ProjectFactUseGrant = {
  assertionId: string;
  assertionVersion: number;
  actorUserId: string;
  purpose: "ai_context";
  audience: FactAudience;
  active: boolean;
};

export interface ProjectFactRepository {
  createCandidate(input: {
    actorUserId: string;
    projectId: string;
    operationId: string;
    expectedProjectRevision: number;
    key: string;
    valueType: ProjectFactAssertion["valueType"];
    value: unknown;
    originKind: FactOrigin;
    sourceEvidenceRef: string | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    observedAt: string | null;
    supersedesAssertionId: string | null;
  }): Promise<ProjectFactAssertion>;
  transition(input: {
    actorUserId: string;
    projectId: string;
    operationId: string;
    expectedProjectRevision: number;
    assertionId: string;
    assertionVersion: number;
    to: FactState;
  }): Promise<ProjectFactAssertion>;
  publish(input: {
    actorUserId: string;
    projectId: string;
    operationId: string;
    expectedProjectRevision: number;
    assertionId: string;
    assertionVersion: number;
    audience: FactAudience;
  }): Promise<ProjectFactPublication>;
  grantAIUse(input: {
    actorUserId: string;
    projectId: string;
    operationId: string;
    expectedProjectRevision: number;
    assertionId: string;
    assertionVersion: number;
    audience: FactAudience;
  }): Promise<ProjectFactUseGrant>;
  revokeAIUse(input: {
    actorUserId: string;
    projectId: string;
    operationId: string;
    expectedProjectRevision: number;
    assertionId: string;
    assertionVersion: number;
  }): Promise<ProjectFactUseGrant>;
  projection(input: { actorUserId: string; projectId: string }): Promise<{
    assertions: ProjectFactAssertion[];
    publications: ProjectFactPublication[];
    grants: ProjectFactUseGrant[];
    conflicts: ProjectFactConflict[];
  } | null>;
}

export class ProjectFactError extends Error {
  readonly code:
    | "invalid_request"
    | "forbidden"
    | "evidence_unverified"
    | "person_authority_unavailable"
    | "professional_authority_unavailable"
    | "supersession_conflict"
    | "operation_conflict"
    | "revision_conflict";

  constructor(code: ProjectFactError["code"]) {
    super(code);
    this.name = "ProjectFactError";
    this.code = code;
  }
}

function normalized(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map(canonical);
    }
    if (typeof input === "object" && input !== null) {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, canonical(child)])
      );
    }
    return input;
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function validateValue(
  type: ProjectFactAssertion["valueType"],
  value: unknown
): string {
  if (
    (type === "string" && (typeof value !== "string" || value.length > 4096)) ||
    (type === "number" &&
      (typeof value !== "number" || !Number.isFinite(value))) ||
    (type === "boolean" && typeof value !== "boolean") ||
    (type === "date" &&
      (typeof value !== "string" || !Number.isFinite(Date.parse(value)))) ||
    (type === "json" &&
      (typeof value !== "object" || value === null || Array.isArray(value)))
  ) {
    throw new ProjectFactError("invalid_request");
  }
  const encoded = JSON.stringify(value);
  if (!encoded || encoded.length > 8192) {
    throw new ProjectFactError("invalid_request");
  }
  const comparisonValue =
    type === "date" && typeof value === "string"
      ? new Date(value).toISOString()
      : type === "string" && typeof value === "string"
        ? value.normalize("NFC").trim()
        : value;
  return normalized(comparisonValue);
}

function dateOrNull(value: string | null) {
  if (value === null) {
    return null;
  }
  if (!Number.isFinite(Date.parse(value))) {
    throw new ProjectFactError("invalid_request");
  }
  return new Date(value).toISOString();
}

export function createProjectFactManagementService(input: {
  repository: ProjectFactRepository;
  verifyEvidence?: (input: {
    actorUserId: string;
    projectId: string;
    evidenceRef: string;
  }) => Promise<boolean>;
}) {
  return {
    async propose(candidate: {
      actorUserId: string;
      projectId: string;
      operationId: string;
      expectedProjectRevision: number;
      key: string;
      valueType: ProjectFactAssertion["valueType"];
      value: unknown;
      originKind: FactOrigin;
      sourceEvidenceRef?: string | null;
      effectiveFrom?: string | null;
      effectiveTo?: string | null;
      observedAt?: string | null;
      supersedesAssertionId?: string | null;
      /** Any person-scoped subject is deliberately unsupported in Round 2. */
      personId?: string | null;
    }) {
      if (candidate.personId !== undefined && candidate.personId !== null) {
        throw new ProjectFactError("person_authority_unavailable");
      }
      if (candidate.originKind === "professional_determination") {
        throw new ProjectFactError("professional_authority_unavailable");
      }
      if (
        !/^[a-z][a-z0-9_.-]{0,127}$/u.test(candidate.key) ||
        !candidate.actorUserId ||
        !candidate.projectId ||
        !candidate.operationId ||
        !Number.isSafeInteger(candidate.expectedProjectRevision) ||
        candidate.expectedProjectRevision < 1 ||
        ![
          "customer_stated",
          "document_extracted",
          "ai_inferred",
          "professional_determination",
        ].includes(candidate.originKind)
      ) {
        throw new ProjectFactError("invalid_request");
      }
      const sourceEvidenceRef = candidate.sourceEvidenceRef ?? null;
      if (
        (candidate.originKind === "document_extracted" && !sourceEvidenceRef) ||
        (sourceEvidenceRef &&
          (!input.verifyEvidence ||
            !(await input.verifyEvidence({
              actorUserId: candidate.actorUserId,
              projectId: candidate.projectId,
              evidenceRef: sourceEvidenceRef,
            }))))
      ) {
        throw new ProjectFactError("evidence_unverified");
      }
      const effectiveFrom = dateOrNull(candidate.effectiveFrom ?? null);
      const effectiveTo = dateOrNull(candidate.effectiveTo ?? null);
      const observedAt = dateOrNull(candidate.observedAt ?? null);
      if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
        throw new ProjectFactError("invalid_request");
      }
      validateValue(candidate.valueType, candidate.value);
      return input.repository.createCandidate({
        ...candidate,
        sourceEvidenceRef,
        effectiveFrom,
        effectiveTo,
        observedAt,
        supersedesAssertionId: candidate.supersedesAssertionId ?? null,
      });
    },

    confirm(
      inputValue: Omit<Parameters<ProjectFactRepository["transition"]>[0], "to">
    ) {
      return input.repository.transition({
        ...inputValue,
        to: "customer_confirmed",
      });
    },

    reject(
      inputValue: Omit<Parameters<ProjectFactRepository["transition"]>[0], "to">
    ) {
      return input.repository.transition({ ...inputValue, to: "rejected" });
    },

    dispute(
      inputValue: Omit<Parameters<ProjectFactRepository["transition"]>[0], "to">
    ) {
      return input.repository.transition({ ...inputValue, to: "disputed" });
    },

    supersede(
      inputValue: Omit<Parameters<ProjectFactRepository["transition"]>[0], "to">
    ) {
      return input.repository.transition({ ...inputValue, to: "superseded" });
    },

    markStale(
      inputValue: Omit<Parameters<ProjectFactRepository["transition"]>[0], "to">
    ) {
      return input.repository.transition({ ...inputValue, to: "stale" });
    },

    publish(inputValue: Parameters<ProjectFactRepository["publish"]>[0]) {
      return input.repository.publish(inputValue);
    },

    grantAIUse(inputValue: Parameters<ProjectFactRepository["grantAIUse"]>[0]) {
      return input.repository.grantAIUse(inputValue);
    },

    revokeAIUse(
      inputValue: Parameters<ProjectFactRepository["revokeAIUse"]>[0]
    ) {
      return input.repository.revokeAIUse(inputValue);
    },

    async stableProjection(inputValue: {
      actorUserId: string;
      projectId: string;
    }) {
      const source = await input.repository.projection(inputValue);
      if (!source) {
        return {
          authorizedForAI: [],
          unresolvedCandidates: [],
          conflicts: [],
          available: false as const,
        };
      }
      const conflictedAssertionIds = new Set(
        source.conflicts
          .filter((conflict) => conflict.resolvedAt === null)
          .flatMap((conflict) => [
            conflict.leftAssertionId,
            conflict.rightAssertionId,
          ])
      );
      const visible = source.assertions.filter((assertion) => {
        if (assertion.projectId !== inputValue.projectId) {
          return false;
        }
        return (
          assertion.createdByUserId === inputValue.actorUserId ||
          source.publications.some(
            (row) =>
              row.assertionId === assertion.id &&
              row.assertionVersion === assertion.version &&
              row.active &&
              (row.audience === "project" ||
                row.actorUserId === inputValue.actorUserId)
          )
        );
      });
      const visibleIds = new Set(visible.map((row) => row.id));
      const visibleConflicts = source.conflicts.filter(
        (conflict) =>
          visibleIds.has(conflict.leftAssertionId) &&
          visibleIds.has(conflict.rightAssertionId)
      );
      const candidatesWithValidSources = await Promise.all(
        visible.map(async (assertion) => ({
          assertion,
          validSource:
            !assertion.sourceEvidenceRef ||
            Boolean(
              input.verifyEvidence &&
                (await input.verifyEvidence({
                  actorUserId: inputValue.actorUserId,
                  projectId: inputValue.projectId,
                  evidenceRef: assertion.sourceEvidenceRef,
                }))
            ),
        }))
      );
      const authorizedForAI = candidatesWithValidSources
        .filter(({ assertion, validSource }) => {
          if (
            assertion.state !== "customer_confirmed" ||
            assertion.stale ||
            conflictedAssertionIds.has(assertion.id) ||
            !validSource ||
            (assertion.originKind === "document_extracted" &&
              !assertion.sourceEvidenceRef)
          ) {
            return false;
          }
          const publication = source.publications.find(
            (row) =>
              row.assertionId === assertion.id &&
              row.assertionVersion === assertion.version &&
              row.active &&
              (row.audience === "project" ||
                row.actorUserId === inputValue.actorUserId)
          );
          const grant = source.grants.find(
            (row) =>
              row.assertionId === assertion.id &&
              row.assertionVersion === assertion.version &&
              row.purpose === "ai_context" &&
              row.active &&
              (row.audience === "project" ||
                row.actorUserId === inputValue.actorUserId)
          );
          return Boolean(publication && grant);
        })
        .map(({ assertion }) => assertion);
      const authorizedIds = new Set(authorizedForAI.map((row) => row.id));
      return {
        authorizedForAI,
        unresolvedCandidates: visible.filter(
          (row) => !authorizedIds.has(row.id)
        ),
        conflicts: visibleConflicts,
        available: true as const,
      };
    },
  };
}

export { validateValue as validateProjectFactValue };
