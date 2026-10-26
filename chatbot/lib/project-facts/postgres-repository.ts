// biome-ignore-all lint/suspicious/useAwait: Methods implement async repository ports and return Drizzle transaction promises.
import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { guestRegex } from "@/lib/constants";
import {
  hashProjectOperationRequest,
  validateProjectOperationId,
} from "@/lib/db/project-foundation-utils";
import type { getLazyDatabase } from "@/lib/db/runtime-client";
import {
  projectEvent,
  projectFactAssertion,
  projectFactAssertionEvent,
  projectFactAssertionEvidence,
  projectFactConflict,
  projectFactPublication,
  projectFactUseGrant,
  projectMembership,
  projectOperation,
  studyJourneyProject,
  user,
} from "@/lib/db/schema";
import type {
  ProjectFactAssertion as Fact,
  ProjectFactRepository,
  ProjectFactPublication as Publication,
  ProjectFactUseGrant as UseGrant,
} from "./facts";
import { ProjectFactError, validateProjectFactValue } from "./facts";

type Database = ReturnType<typeof getLazyDatabase>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type OperationType = "project_fact_mutation";

function fail(code: ConstructorParameters<typeof ProjectFactError>[0]): never {
  throw new ProjectFactError(code);
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function assertActor(
  tx: Transaction,
  projectId: string,
  actorUserId: string,
  write: boolean
) {
  const [project] = await tx
    .select()
    .from(studyJourneyProject)
    .where(eq(studyJourneyProject.id, projectId))
    .for("update")
    .limit(1);
  if (!project) {
    fail("forbidden");
  }
  if (write && project.status !== "active") {
    fail("forbidden");
  }
  const [actor] = await tx
    .select({ email: user.email, role: user.role })
    .from(user)
    .where(eq(user.id, actorUserId))
    .limit(1);
  if (!actor || actor.role !== "user" || guestRegex.test(actor.email)) {
    fail("forbidden");
  }
  if (project.ownerUserId !== actorUserId) {
    const [membership] = await tx
      .select({ status: projectMembership.status })
      .from(projectMembership)
      .where(
        and(
          eq(projectMembership.projectId, projectId),
          eq(projectMembership.userId, actorUserId)
        )
      )
      .for("update")
      .limit(1);
    if (membership?.status !== "active") {
      fail("forbidden");
    }
  }
  return project;
}

function requestHash(type: OperationType, input: Record<string, unknown>) {
  return hashProjectOperationRequest({ operationType: type, ...input });
}

function cleanOperationId(value: string) {
  try {
    return validateProjectOperationId(value);
  } catch {
    return fail("invalid_request");
  }
}

async function assertAssertionCreator(
  tx: Transaction,
  input: { projectId: string; assertionId: string; actorUserId: string }
) {
  const [assertion] = await tx
    .select({
      createdByUserId: projectFactAssertion.createdByUserId,
      key: projectFactAssertion.key,
      state: projectFactAssertion.state,
    })
    .from(projectFactAssertion)
    .where(
      and(
        eq(projectFactAssertion.projectId, input.projectId),
        eq(projectFactAssertion.id, input.assertionId)
      )
    )
    .for("update")
    .limit(1);
  if (!assertion || assertion.createdByUserId !== input.actorUserId) {
    fail("forbidden");
  }
  return assertion;
}

function factSnapshot(
  row: typeof projectFactAssertion.$inferSelect,
  sourceEvidenceRef: string | null
): Fact {
  return {
    ...row,
    valueType: row.valueType as Fact["valueType"],
    originKind: row.originKind as Fact["originKind"],
    state: row.state as Fact["state"],
    effectiveFrom: row.effectiveFrom?.toISOString() ?? null,
    effectiveTo: row.effectiveTo?.toISOString() ?? null,
    observedAt: row.observedAt?.toISOString() ?? null,
    sourceEvidenceRef,
  };
}

function mapFactUseGrant(
  row: typeof projectFactUseGrant.$inferSelect
): UseGrant {
  return {
    ...row,
    purpose: "ai_context",
    active: row.revokedAt === null,
  };
}

function knownOverlap(a: Fact, b: Fact) {
  if (
    !a.effectiveFrom ||
    !b.effectiveFrom ||
    !a.effectiveTo ||
    !b.effectiveTo
  ) {
    return null;
  }
  const toMillis = (value: string | Date) =>
    value instanceof Date ? value.getTime() : Date.parse(value);
  return (
    toMillis(a.effectiveFrom) <= toMillis(b.effectiveTo) &&
    toMillis(b.effectiveFrom) <= toMillis(a.effectiveTo)
  );
}

export class PostgresProjectFactRepository implements ProjectFactRepository {
  private readonly database: Database;
  private readonly verifyEvidence?: (input: {
    actorUserId: string;
    projectId: string;
    evidenceRef: string;
  }) => Promise<boolean>;

  constructor(
    database: Database,
    verifyEvidence?: (input: {
      actorUserId: string;
      projectId: string;
      evidenceRef: string;
    }) => Promise<boolean>
  ) {
    this.database = database;
    this.verifyEvidence = verifyEvidence;
  }

  private async operation(
    tx: Transaction,
    input: {
      actorUserId: string;
      operationId: string;
      hash: string;
      projectId: string;
    }
  ) {
    const [existing] = await tx
      .select()
      .from(projectOperation)
      .where(
        and(
          eq(projectOperation.actorUserId, input.actorUserId),
          eq(projectOperation.operationType, "project_fact_mutation"),
          eq(projectOperation.operationId, input.operationId)
        )
      )
      .for("update")
      .limit(1);
    if (!existing) {
      return null;
    }
    if (
      existing.requestHash !== input.hash ||
      existing.resultKind !== "project_fact_assertion"
    ) {
      fail("operation_conflict");
    }
    const [event] = await tx
      .select()
      .from(projectFactAssertionEvent)
      .where(
        and(
          eq(projectFactAssertionEvent.operationRecordId, existing.id),
          eq(projectFactAssertionEvent.projectId, input.projectId)
        )
      )
      .limit(1);
    const outcome = jsonRecord(event?.newValue);
    if (!event || !outcome || existing.resultId !== outcome.assertionId) {
      fail("operation_conflict");
    }
    return outcome;
  }

  private async commitAudit(
    tx: Transaction,
    input: {
      actorUserId: string;
      projectId: string;
      operationId: string;
      hash: string;
      assertionId: string;
      projectRevision: number;
      kind: string;
      oldValue: Record<string, unknown> | null;
      newValue: Record<string, unknown>;
    }
  ) {
    const [operation] = await tx
      .insert(projectOperation)
      .values({
        actorUserId: input.actorUserId,
        actorKind: "user",
        servicePrincipalCode: null,
        operationType: "project_fact_mutation",
        operationId: input.operationId,
        requestHash: input.hash,
        resultKind: "project_fact_assertion",
        resultId: input.assertionId,
      })
      .onConflictDoNothing()
      .returning();
    if (!operation) {
      fail("operation_conflict");
    }
    const projectRevision = input.projectRevision + 1;
    const [project] = await tx
      .update(studyJourneyProject)
      .set({ revision: projectRevision, updatedAt: new Date() })
      .where(
        and(
          eq(studyJourneyProject.id, input.projectId),
          eq(studyJourneyProject.revision, input.projectRevision),
          eq(studyJourneyProject.status, "active")
        )
      )
      .returning({ revision: studyJourneyProject.revision });
    if (!project) {
      fail("revision_conflict");
    }
    await tx.insert(projectFactAssertionEvent).values({
      projectId: input.projectId,
      assertionId: input.assertionId,
      actorUserId: input.actorUserId,
      operationRecordId: operation.id,
      eventKind: input.kind,
      oldValue: input.oldValue,
      newValue: input.newValue,
    });
    await tx.insert(projectEvent).values({
      projectId: input.projectId,
      actorKind: "user",
      actorUserId: input.actorUserId,
      servicePrincipalCode: null,
      projectRevision,
      eventType: "project_fact_changed",
      subjectKind: "project_fact_assertion",
      subjectId: input.assertionId,
      operationRecordId: operation.id,
    });
    return projectRevision;
  }

  async createCandidate(
    input: Parameters<ProjectFactRepository["createCandidate"]>[0]
  ): Promise<Fact> {
    const operationId = cleanOperationId(input.operationId);
    const normalizedComparison = validateProjectFactValue(
      input.valueType,
      input.value
    );
    const base = {
      actorUserId: input.actorUserId,
      projectId: input.projectId,
      operationId,
      expectedProjectRevision: input.expectedProjectRevision,
      key: input.key,
      valueType: input.valueType,
      value: input.value,
      originKind: input.originKind,
      sourceEvidenceRef: input.sourceEvidenceRef,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      observedAt: input.observedAt,
      supersedesAssertionId: input.supersedesAssertionId,
    };
    const hash = requestHash("project_fact_mutation", base);
    return this.database.transaction(async (tx) => {
      const project = await assertActor(
        tx,
        input.projectId,
        input.actorUserId,
        true
      );
      const priorAssertion = input.supersedesAssertionId
        ? await assertAssertionCreator(tx, {
            projectId: input.projectId,
            assertionId: input.supersedesAssertionId,
            actorUserId: input.actorUserId,
          })
        : null;
      const replay = await this.operation(tx, {
        actorUserId: input.actorUserId,
        operationId,
        hash,
        projectId: input.projectId,
      });
      if (replay) {
        const assertion = replay.assertion as Fact | undefined;
        if (!assertion) {
          fail("operation_conflict");
        }
        return assertion;
      }
      if (project.revision !== input.expectedProjectRevision) {
        fail("revision_conflict");
      }
      if (
        input.supersedesAssertionId &&
        (!priorAssertion ||
          priorAssertion.key !== input.key ||
          priorAssertion.state !== "superseded")
      ) {
        fail("supersession_conflict");
      }
      if (
        input.sourceEvidenceRef &&
        (!this.verifyEvidence ||
          !(await this.verifyEvidence({
            actorUserId: input.actorUserId,
            projectId: input.projectId,
            evidenceRef: input.sourceEvidenceRef,
          })))
      ) {
        fail("evidence_unverified");
      }
      if (
        input.originKind === "document_extracted" &&
        !input.sourceEvidenceRef
      ) {
        fail("evidence_unverified");
      }
      const id = randomUUID();
      const [row] = await tx
        .insert(projectFactAssertion)
        .values({
          id,
          projectId: input.projectId,
          key: input.key,
          valueType: input.valueType,
          value: input.value,
          normalizedComparison,
          originKind: input.originKind,
          state: "proposed",
          createdByUserId: input.actorUserId,
          confirmedByUserId: null,
          effectiveFrom: input.effectiveFrom
            ? new Date(input.effectiveFrom)
            : null,
          effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
          observedAt: input.observedAt ? new Date(input.observedAt) : null,
          supersedesAssertionId: input.supersedesAssertionId,
          version: 1,
          stale: false,
        })
        .returning();
      if (!row) {
        fail("invalid_request");
      }
      if (input.sourceEvidenceRef) {
        await tx.insert(projectFactAssertionEvidence).values({
          projectId: input.projectId,
          assertionId: id,
          assertionVersion: 1,
          evidenceRefId: input.sourceEvidenceRef,
          linkedByUserId: input.actorUserId,
        });
      }
      const existing = await tx
        .select()
        .from(projectFactAssertion)
        .where(
          and(
            eq(projectFactAssertion.projectId, input.projectId),
            eq(projectFactAssertion.key, input.key)
          )
        )
        .for("update");
      for (const otherRow of existing) {
        if (
          otherRow.id === id ||
          otherRow.state === "rejected" ||
          otherRow.state === "superseded"
        ) {
          continue;
        }
        const other = factSnapshot(otherRow, null);
        if (other.normalizedComparison === normalizedComparison) {
          continue;
        }
        const overlap = knownOverlap(
          other,
          factSnapshot(row, input.sourceEvidenceRef)
        );
        if (overlap === false) {
          continue;
        }
        const [left, right] = other.id < id ? [other.id, id] : [id, other.id];
        await tx
          .insert(projectFactConflict)
          .values({
            projectId: input.projectId,
            leftAssertionId: left,
            rightAssertionId: right,
            kind: overlap === true ? "conflict" : "possible_conflict",
          })
          .onConflictDoNothing();
      }
      const newValue = {
        assertionId: id,
        assertionVersion: 1,
        state: "proposed",
        assertion: factSnapshot(row, input.sourceEvidenceRef),
      };
      await this.commitAudit(tx, {
        actorUserId: input.actorUserId,
        projectId: input.projectId,
        operationId,
        hash,
        assertionId: id,
        projectRevision: project.revision,
        kind: "proposed",
        oldValue: null,
        newValue,
      });
      return factSnapshot(row, input.sourceEvidenceRef);
    });
  }

  async transition(
    input: Parameters<ProjectFactRepository["transition"]>[0]
  ): Promise<Fact> {
    const operationId = cleanOperationId(input.operationId);
    if (
      ![
        "customer_confirmed",
        "rejected",
        "disputed",
        "stale",
        "superseded",
      ].includes(input.to)
    ) {
      fail("invalid_request");
    }
    const hash = requestHash("project_fact_mutation", {
      ...input,
      operationType: input.to,
    });
    return this.database.transaction(async (tx) => {
      const project = await assertActor(
        tx,
        input.projectId,
        input.actorUserId,
        true
      );
      await assertAssertionCreator(tx, {
        projectId: input.projectId,
        assertionId: input.assertionId,
        actorUserId: input.actorUserId,
      });
      const replay = await this.operation(tx, {
        actorUserId: input.actorUserId,
        operationId,
        hash,
        projectId: input.projectId,
      });
      if (replay) {
        const assertion = replay.assertion as Fact | undefined;
        if (!assertion) {
          fail("operation_conflict");
        }
        return assertion;
      }
      if (project.revision !== input.expectedProjectRevision) {
        fail("revision_conflict");
      }
      const [row] = await tx
        .select()
        .from(projectFactAssertion)
        .where(
          and(
            eq(projectFactAssertion.projectId, input.projectId),
            eq(projectFactAssertion.id, input.assertionId)
          )
        )
        .for("update")
        .limit(1);
      if (
        !row ||
        row.version !== input.assertionVersion ||
        (row.state !== "proposed" &&
          !(
            (input.to === "superseded" || input.to === "stale") &&
            row.state === "customer_confirmed"
          )) ||
        row.stale
      ) {
        fail("revision_conflict");
      }
      if (
        input.to === "customer_confirmed" &&
        row.originKind === "document_extracted"
      ) {
        const [evidence] = await tx
          .select({ evidenceRefId: projectFactAssertionEvidence.evidenceRefId })
          .from(projectFactAssertionEvidence)
          .where(
            and(
              eq(projectFactAssertionEvidence.projectId, input.projectId),
              eq(projectFactAssertionEvidence.assertionId, input.assertionId),
              eq(projectFactAssertionEvidence.assertionVersion, row.version)
            )
          )
          .limit(1);
        if (
          !evidence ||
          !this.verifyEvidence ||
          !(await this.verifyEvidence({
            actorUserId: input.actorUserId,
            projectId: input.projectId,
            evidenceRef: evidence.evidenceRefId,
          }))
        ) {
          fail("evidence_unverified");
        }
      }
      const [updated] = await tx
        .update(projectFactAssertion)
        .set({
          state: input.to,
          confirmedByUserId:
            input.to === "customer_confirmed" ? input.actorUserId : null,
          stale: input.to === "stale" ? true : row.stale,
        })
        .where(
          and(
            eq(projectFactAssertion.id, input.assertionId),
            eq(projectFactAssertion.version, row.version)
          )
        )
        .returning();
      if (!updated) {
        fail("revision_conflict");
      }
      const [evidence] = await tx
        .select({ evidenceRefId: projectFactAssertionEvidence.evidenceRefId })
        .from(projectFactAssertionEvidence)
        .where(
          and(
            eq(projectFactAssertionEvidence.projectId, input.projectId),
            eq(projectFactAssertionEvidence.assertionId, input.assertionId),
            eq(projectFactAssertionEvidence.assertionVersion, row.version)
          )
        )
        .limit(1);
      if (evidence && input.to === "customer_confirmed") {
        await tx
          .insert(projectFactAssertionEvidence)
          .values({
            projectId: input.projectId,
            assertionId: input.assertionId,
            assertionVersion: updated.version,
            evidenceRefId: evidence.evidenceRefId,
            linkedByUserId: input.actorUserId,
          })
          .onConflictDoNothing();
      }
      if (input.to === "superseded" || input.to === "stale") {
        const revokedAt = new Date();
        await tx
          .update(projectFactPublication)
          .set({ active: false, revokedAt })
          .where(
            and(
              eq(projectFactPublication.projectId, input.projectId),
              eq(projectFactPublication.assertionId, input.assertionId),
              eq(projectFactPublication.active, true)
            )
          );
        await tx
          .update(projectFactUseGrant)
          .set({ revokedAt })
          .where(
            and(
              eq(projectFactUseGrant.projectId, input.projectId),
              eq(projectFactUseGrant.assertionId, input.assertionId),
              isNull(projectFactUseGrant.revokedAt)
            )
          );
      }
      const hashValue = {
        assertionId: input.assertionId,
        assertionVersion: updated.version,
        state: updated.state,
        assertion: factSnapshot(updated, evidence?.evidenceRefId ?? null),
      };
      await this.commitAudit(tx, {
        actorUserId: input.actorUserId,
        projectId: input.projectId,
        operationId,
        hash,
        assertionId: input.assertionId,
        projectRevision: project.revision,
        kind:
          input.to === "customer_confirmed"
            ? "confirmed"
            : input.to === "rejected"
              ? "rejected"
              : input.to,
        oldValue: { state: row.state, version: row.version },
        newValue: hashValue,
      });
      return factSnapshot(updated, evidence?.evidenceRefId ?? null);
    });
  }

  async publish(
    input: Parameters<ProjectFactRepository["publish"]>[0]
  ): Promise<Publication> {
    return this.mutateGrant(input, "publish");
  }

  async grantAIUse(
    input: Parameters<ProjectFactRepository["grantAIUse"]>[0]
  ): Promise<UseGrant> {
    return this.mutateGrant(input, "grant");
  }

  async revokeAIUse(
    input: Parameters<ProjectFactRepository["revokeAIUse"]>[0]
  ): Promise<UseGrant> {
    return this.mutateGrant(input, "revoke");
  }

  private async mutateGrant(
    input: {
      actorUserId: string;
      projectId: string;
      operationId: string;
      expectedProjectRevision: number;
      assertionId: string;
      assertionVersion: number;
      audience?: "actor_only" | "project";
    },
    kind: "publish" | "grant" | "revoke"
  ): Promise<any> {
    const operationId = cleanOperationId(input.operationId);
    const hash = requestHash("project_fact_mutation", {
      ...input,
      operationType: kind,
    });
    return this.database.transaction(async (tx) => {
      const project = await assertActor(
        tx,
        input.projectId,
        input.actorUserId,
        true
      );
      await assertAssertionCreator(tx, {
        projectId: input.projectId,
        assertionId: input.assertionId,
        actorUserId: input.actorUserId,
      });
      const replay = await this.operation(tx, {
        actorUserId: input.actorUserId,
        operationId,
        hash,
        projectId: input.projectId,
      });
      if (replay) {
        return replay.result as Publication | UseGrant;
      }
      if (project.revision !== input.expectedProjectRevision) {
        fail("revision_conflict");
      }
      const [assertion] = await tx
        .select()
        .from(projectFactAssertion)
        .where(
          and(
            eq(projectFactAssertion.projectId, input.projectId),
            eq(projectFactAssertion.id, input.assertionId)
          )
        )
        .for("update")
        .limit(1);
      if (
        !assertion ||
        assertion.version !== input.assertionVersion ||
        assertion.state !== "customer_confirmed" ||
        assertion.stale
      ) {
        fail("forbidden");
      }
      const [conflict] = await tx
        .select()
        .from(projectFactConflict)
        .where(
          and(
            eq(projectFactConflict.projectId, input.projectId),
            or(
              eq(projectFactConflict.leftAssertionId, assertion.id),
              eq(projectFactConflict.rightAssertionId, assertion.id)
            ),
            isNull(projectFactConflict.resolvedAt)
          )
        )
        .limit(1);
      if (conflict) {
        fail("forbidden");
      }
      let result: Publication | UseGrant;
      if (kind === "publish") {
        const [row] = await tx
          .insert(projectFactPublication)
          .values({
            projectId: input.projectId,
            assertionId: assertion.id,
            assertionVersion: assertion.version,
            actorUserId: input.actorUserId,
            audience: input.audience ?? "actor_only",
            active: true,
          })
          .onConflictDoNothing()
          .returning();
        const stored = (row ??
          (
            await tx
              .select()
              .from(projectFactPublication)
              .where(
                and(
                  eq(projectFactPublication.projectId, input.projectId),
                  eq(projectFactPublication.assertionId, assertion.id),
                  eq(
                    projectFactPublication.assertionVersion,
                    assertion.version
                  ),
                  eq(projectFactPublication.active, true)
                )
              )
              .limit(1)
          )[0]) as Publication;
        result = stored;
      } else if (kind === "grant") {
        const [row] = await tx
          .insert(projectFactUseGrant)
          .values({
            projectId: input.projectId,
            assertionId: assertion.id,
            assertionVersion: assertion.version,
            actorUserId: input.actorUserId,
            purpose: "ai_context",
            audience: input.audience ?? "actor_only",
            revokedAt: null,
          })
          .onConflictDoNothing()
          .returning();
        const stored = (row ??
          (
            await tx
              .select()
              .from(projectFactUseGrant)
              .where(
                and(
                  eq(projectFactUseGrant.projectId, input.projectId),
                  eq(projectFactUseGrant.assertionId, assertion.id),
                  eq(projectFactUseGrant.assertionVersion, assertion.version),
                  eq(projectFactUseGrant.actorUserId, input.actorUserId),
                  isNull(projectFactUseGrant.revokedAt)
                )
              )
              .limit(1)
          )[0]) as typeof projectFactUseGrant.$inferSelect;
        result = mapFactUseGrant(stored);
      } else {
        const [row] = await tx
          .update(projectFactUseGrant)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(projectFactUseGrant.projectId, input.projectId),
              eq(projectFactUseGrant.assertionId, assertion.id),
              eq(projectFactUseGrant.assertionVersion, assertion.version),
              eq(projectFactUseGrant.actorUserId, input.actorUserId),
              isNull(projectFactUseGrant.revokedAt)
            )
          )
          .returning();
        if (!row) {
          fail("forbidden");
        }
        result = mapFactUseGrant(row);
      }
      const newValue = {
        assertionId: assertion.id,
        assertionVersion: assertion.version,
        kind,
        result,
      };
      await this.commitAudit(tx, {
        actorUserId: input.actorUserId,
        projectId: input.projectId,
        operationId,
        hash,
        assertionId: assertion.id,
        projectRevision: project.revision,
        kind:
          kind === "publish"
            ? "published"
            : kind === "grant"
              ? "grant_created"
              : "grant_revoked",
        oldValue: null,
        newValue,
      });
      return result;
    });
  }

  async projection(input: { actorUserId: string; projectId: string }) {
    return this.database.transaction(async (tx) => {
      try {
        await assertActor(tx, input.projectId, input.actorUserId, false);
      } catch {
        return null;
      }
      const [assertions, publications, grants, conflicts, evidenceLinks] =
        await Promise.all([
          tx
            .select()
            .from(projectFactAssertion)
            .where(eq(projectFactAssertion.projectId, input.projectId))
            .orderBy(asc(projectFactAssertion.createdAt)),
          tx
            .select()
            .from(projectFactPublication)
            .where(eq(projectFactPublication.projectId, input.projectId)),
          tx
            .select()
            .from(projectFactUseGrant)
            .where(eq(projectFactUseGrant.projectId, input.projectId)),
          tx
            .select()
            .from(projectFactConflict)
            .where(eq(projectFactConflict.projectId, input.projectId)),
          tx
            .select()
            .from(projectFactAssertionEvidence)
            .where(eq(projectFactAssertionEvidence.projectId, input.projectId)),
        ]);
      const evidenceByAssertion = new Map<string, string>();
      for (const link of evidenceLinks) {
        if (!evidenceByAssertion.has(link.assertionId)) {
          evidenceByAssertion.set(link.assertionId, link.evidenceRefId);
        }
      }
      return {
        assertions: assertions.map((row) => ({
          ...row,
          createdByUserId: row.createdByUserId,
          sourceEvidenceRef: evidenceByAssertion.get(row.id) ?? null,
          effectiveFrom: row.effectiveFrom?.toISOString() ?? null,
          effectiveTo: row.effectiveTo?.toISOString() ?? null,
          observedAt: row.observedAt?.toISOString() ?? null,
        })) as unknown as Fact[],
        publications: publications.map((row) => ({
          ...row,
          actorUserId: row.actorUserId,
          active: row.active && !row.revokedAt,
        })) as unknown as Publication[],
        grants: grants.map((row) => ({
          ...row,
          actorUserId: row.actorUserId,
          purpose: "ai_context",
          active: !row.revokedAt,
        })) as unknown as UseGrant[],
        conflicts: conflicts.map((row) => ({
          ...row,
          resolvedAt: row.resolvedAt?.toISOString() ?? null,
        })),
      };
    });
  }
}
