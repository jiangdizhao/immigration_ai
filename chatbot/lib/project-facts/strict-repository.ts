import type {
  FactOrigin,
  FactState,
  ProjectFactAssertion,
  ProjectFactConflict,
  ProjectFactPublication,
  ProjectFactRepository,
  ProjectFactUseGrant,
} from "./facts";
import {
  factGrantRequestHash,
  factMutationRequestHash,
  factTransitionRequestHash,
} from "./request-identity";

/**
 * Test-support only: a strict in-memory simulation of
 * `PostgresProjectFactRepository`'s observable contract.
 *
 * Unlike a permissive fake, this enforces exactly the rules the SQL repository enforces and
 * that R1-01/R1-02 depend on:
 *
 * - every non-replayed mutation advances the Project revision by exactly one;
 * - a stale `expectedProjectRevision` fails with `revision_conflict` (compare-and-swap);
 * - a repeated `operationId` replays the stored result without advancing the revision, and a
 *   different payload under the same id fails with `operation_conflict`;
 * - transitions require the exact assertion version and a legal state;
 * - `supersedesAssertionId` is only accepted when the referenced assertion is already
 *   `superseded` and has the same key;
 * - publication / AI grant require `customer_confirmed`, no unresolved conflict and the
 *   exact version;
 * - `document_extracted` facts require a verified evidence reference.
 *
 * It is not a substitute for real PostgreSQL integration; it is the strictest offline
 * contract check available without a database.
 */
export class StrictFactRepository implements ProjectFactRepository {
  readonly assertions: ProjectFactAssertion[] = [];
  readonly publications: ProjectFactPublication[] = [];
  readonly grants: ProjectFactUseGrant[] = [];
  readonly conflicts: ProjectFactConflict[] = [];
  readonly revisions = new Map<string, number>();
  readonly mutationLog: Array<{
    operationId: string;
    expectedRevision: number;
    replayed: boolean;
    ok: boolean;
  }> = [];
  verifiedEvidenceRefs = new Set<string>();
  /** Optional verifier (mirrors the repository's injected `verifyEvidence`). */
  verifyEvidence: ((evidenceRef: string) => Promise<boolean> | boolean) | null =
    null;
  /** Simulates an external concurrent Project mutation before the next write. */
  externalMutationBeforeNextWrite: ((projectId: string) => void) | null = null;
  /** Forces a failure for a given operation id. */
  failOperation: ((operationId: string) => Error | null) | null = null;

  private readonly operations = new Map<
    string,
    { hash: string; result: unknown }
  >();
  private counter = 0;

  constructor(initialProjectRevision = 1) {
    this.revisions.set("project-a", initialProjectRevision);
  }

  revisionFor(projectId: string): number {
    return this.revisions.get(projectId) ?? 0;
  }

  /** Simulates another writer advancing the Project revision. */
  bumpRevision(projectId = "project-a"): void {
    this.revisions.set(projectId, this.revisionFor(projectId) + 1);
  }

  private nextId(prefix: string) {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  private conflict(code: string): Error {
    return Object.assign(new Error(code), { code });
  }

  private async isVerified(evidenceRef: string): Promise<boolean> {
    if (this.verifyEvidence) {
      return await this.verifyEvidence(evidenceRef);
    }
    return this.verifiedEvidenceRefs.has(evidenceRef);
  }

  private hashOf(value: unknown): string {
    return JSON.stringify(value);
  }

  private log(
    input: { operationId: string; expectedProjectRevision: number },
    replayed: boolean,
    ok: boolean
  ) {
    this.mutationLog.push({
      operationId: input.operationId,
      expectedRevision: input.expectedProjectRevision,
      replayed,
      ok,
    });
  }

  private guard(input: {
    projectId: string;
    operationId: string;
    hash: string;
    expectedProjectRevision: number;
  }): { replay: unknown } | null {
    if (this.externalMutationBeforeNextWrite) {
      const hook = this.externalMutationBeforeNextWrite;
      this.externalMutationBeforeNextWrite = null;
      hook(input.projectId);
    }
    const existing = this.operations.get(input.operationId);
    if (existing) {
      if (existing.hash !== input.hash) {
        this.log(input, false, false);
        throw this.conflict("operation_conflict");
      }
      this.log(input, true, true);
      return { replay: existing.result };
    }
    const forced = this.failOperation?.(input.operationId) ?? null;
    if (forced) {
      this.log(input, false, false);
      throw forced;
    }
    if (this.revisionFor(input.projectId) !== input.expectedProjectRevision) {
      this.log(input, false, false);
      throw this.conflict("revision_conflict");
    }
    return null;
  }

  private commit(input: {
    projectId: string;
    operationId: string;
    hash: string;
    expectedProjectRevision: number;
    result: unknown;
  }) {
    this.operations.set(input.operationId, {
      hash: input.hash,
      result: input.result,
    });
    this.revisions.set(input.projectId, input.expectedProjectRevision + 1);
    this.log(input, false, true);
  }

  async createCandidate(
    input: Parameters<ProjectFactRepository["createCandidate"]>[0]
  ): Promise<ProjectFactAssertion> {
    await Promise.resolve();
    // Same identity function as the PostgreSQL repository (revision excluded, payload kept).
    const hash = factMutationRequestHash({
      actorUserId: input.actorUserId,
      projectId: input.projectId,
      operationId: input.operationId,
      key: input.key,
      valueType: input.valueType,
      value: input.value,
      originKind: input.originKind,
      sourceEvidenceRef: input.sourceEvidenceRef,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      observedAt: input.observedAt,
      supersedesAssertionId: input.supersedesAssertionId,
    });
    const gate = this.guard({ ...input, hash });
    if (gate) {
      return gate.replay as ProjectFactAssertion;
    }
    if (input.originKind === "document_extracted" && !input.sourceEvidenceRef) {
      throw this.conflict("evidence_unverified");
    }
    if (
      input.sourceEvidenceRef &&
      !(await this.isVerified(input.sourceEvidenceRef))
    ) {
      throw this.conflict("evidence_unverified");
    }
    const prior = input.supersedesAssertionId
      ? this.assertions.find((row) => row.id === input.supersedesAssertionId)
      : null;
    if (
      input.supersedesAssertionId &&
      (!prior || prior.key !== input.key || prior.state !== "superseded")
    ) {
      throw this.conflict("supersession_conflict");
    }
    const assertion: ProjectFactAssertion = {
      id: this.nextId("assertion"),
      projectId: input.projectId,
      key: input.key,
      valueType: input.valueType,
      value: input.value,
      normalizedComparison: this.hashOf(input.value),
      originKind: input.originKind as FactOrigin,
      state: "proposed",
      sourceEvidenceRef: input.sourceEvidenceRef,
      createdByUserId: input.actorUserId,
      confirmedByUserId: null,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      observedAt: input.observedAt,
      supersedesAssertionId: input.supersedesAssertionId,
      version: 1,
      stale: false,
    };
    this.assertions.push(assertion);
    for (const other of this.assertions) {
      if (
        other.id === assertion.id ||
        other.key !== assertion.key ||
        other.state === "rejected" ||
        other.state === "superseded" ||
        other.normalizedComparison === assertion.normalizedComparison
      ) {
        continue;
      }
      const [left, right] =
        other.id < assertion.id
          ? [other.id, assertion.id]
          : [assertion.id, other.id];
      this.conflicts.push({
        id: this.nextId("conflict"),
        projectId: input.projectId,
        leftAssertionId: left,
        rightAssertionId: right,
        kind: "conflict",
        resolvedAt: null,
      });
    }
    this.commit({ ...input, hash, result: { ...assertion } });
    return { ...assertion };
  }

  async transition(
    input: Parameters<ProjectFactRepository["transition"]>[0]
  ): Promise<ProjectFactAssertion> {
    await Promise.resolve();
    const hash = factTransitionRequestHash({
      actorUserId: input.actorUserId,
      projectId: input.projectId,
      operationId: input.operationId,
      assertionId: input.assertionId,
      assertionVersion: input.assertionVersion,
      to: input.to,
    });
    const gate = this.guard({ ...input, hash });
    if (gate) {
      return gate.replay as ProjectFactAssertion;
    }
    const row = this.assertions.find((entry) => entry.id === input.assertionId);
    if (!row || row.projectId !== input.projectId) {
      throw this.conflict("forbidden");
    }
    if (row.version !== input.assertionVersion || row.stale) {
      throw this.conflict("revision_conflict");
    }
    const legal =
      row.state === "proposed" ||
      ((input.to === "superseded" || input.to === "stale") &&
        row.state === "customer_confirmed");
    if (!legal) {
      throw this.conflict("state_conflict");
    }
    if (
      input.to === "customer_confirmed" &&
      row.originKind === "document_extracted" &&
      (!row.sourceEvidenceRef ||
        !(await this.isVerified(row.sourceEvidenceRef)))
    ) {
      throw this.conflict("evidence_unverified");
    }
    row.state = input.to as FactState;
    row.version += 1;
    row.confirmedByUserId =
      input.to === "customer_confirmed" ? input.actorUserId : null;
    if (input.to === "stale") {
      row.stale = true;
    }
    if (input.to === "superseded" || input.to === "stale") {
      for (const publication of this.publications) {
        if (publication.assertionId === row.id) {
          publication.active = false;
        }
      }
      for (const grant of this.grants) {
        if (grant.assertionId === row.id) {
          grant.active = false;
        }
      }
    }
    const snapshot = { ...row };
    this.commit({ ...input, hash, result: snapshot });
    return { ...snapshot };
  }

  async publish(
    input: Parameters<ProjectFactRepository["publish"]>[0]
  ): Promise<ProjectFactPublication> {
    await Promise.resolve();
    const hash = factGrantRequestHash({
      actorUserId: input.actorUserId,
      projectId: input.projectId,
      operationId: input.operationId,
      assertionId: input.assertionId,
      assertionVersion: input.assertionVersion,
      audience: input.audience,
      kind: "publish",
    });
    const gate = this.guard({ ...input, hash });
    if (gate) {
      return gate.replay as ProjectFactPublication;
    }
    const assertion = this.requireConfirmed(input);
    const publication: ProjectFactPublication = {
      assertionId: assertion.id,
      assertionVersion: assertion.version,
      actorUserId: input.actorUserId,
      audience: input.audience,
      active: true,
    };
    this.publications.push(publication);
    this.commit({ ...input, hash, result: publication });
    return publication;
  }

  async grantAIUse(
    input: Parameters<ProjectFactRepository["grantAIUse"]>[0]
  ): Promise<ProjectFactUseGrant> {
    await Promise.resolve();
    const hash = factGrantRequestHash({
      actorUserId: input.actorUserId,
      projectId: input.projectId,
      operationId: input.operationId,
      assertionId: input.assertionId,
      assertionVersion: input.assertionVersion,
      audience: input.audience,
      kind: "grant",
    });
    const gate = this.guard({ ...input, hash });
    if (gate) {
      return gate.replay as ProjectFactUseGrant;
    }
    const assertion = this.requireConfirmed(input);
    const grant: ProjectFactUseGrant = {
      assertionId: assertion.id,
      assertionVersion: assertion.version,
      actorUserId: input.actorUserId,
      purpose: "ai_context",
      audience: input.audience,
      active: true,
    };
    this.grants.push(grant);
    this.commit({ ...input, hash, result: grant });
    return grant;
  }

  async revokeAIUse(
    input: Parameters<ProjectFactRepository["revokeAIUse"]>[0]
  ): Promise<ProjectFactUseGrant> {
    await Promise.resolve();
    const hash = factGrantRequestHash({
      actorUserId: input.actorUserId,
      projectId: input.projectId,
      operationId: input.operationId,
      assertionId: input.assertionId,
      assertionVersion: input.assertionVersion,
      kind: "revoke",
    });
    const gate = this.guard({ ...input, hash });
    if (gate) {
      return gate.replay as ProjectFactUseGrant;
    }
    const grant = this.grants.find(
      (row) => row.assertionId === input.assertionId && row.active
    );
    if (!grant) {
      throw this.conflict("invalid_request");
    }
    grant.active = false;
    this.commit({ ...input, hash, result: grant });
    return grant;
  }

  async projection(input: { actorUserId: string; projectId: string }) {
    await Promise.resolve();
    return {
      assertions: this.assertions
        .filter((row) => row.projectId === input.projectId)
        .map((row) => ({ ...row })),
      publications: this.publications.map((row) => ({ ...row })),
      grants: this.grants.map((row) => ({ ...row })),
      conflicts: this.conflicts.map((row) => ({ ...row })),
    };
  }

  private requireConfirmed(input: {
    projectId: string;
    assertionId: string;
    assertionVersion: number;
  }): ProjectFactAssertion {
    const assertion = this.assertions.find(
      (row) => row.id === input.assertionId && row.projectId === input.projectId
    );
    if (
      !assertion ||
      assertion.version !== input.assertionVersion ||
      assertion.state !== "customer_confirmed" ||
      assertion.stale
    ) {
      throw this.conflict("forbidden");
    }
    const conflicted = this.conflicts.some(
      (row) =>
        row.resolvedAt === null &&
        (row.leftAssertionId === assertion.id ||
          row.rightAssertionId === assertion.id)
    );
    if (conflicted) {
      throw this.conflict("forbidden");
    }
    return assertion;
  }
}
