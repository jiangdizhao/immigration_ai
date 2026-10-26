// biome-ignore-all lint/suspicious/useAwait: Methods implement the async persistence port and return Drizzle transaction promises.
import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { guestRegex } from "@/lib/constants";
import {
  hashProjectOperationRequest,
  validateProjectOperationId,
} from "@/lib/db/project-foundation-utils";
import type { getLazyDatabase } from "@/lib/db/runtime-client";
import {
  projectDocumentAsset,
  projectDocumentEvidenceUnit,
  projectDocumentGrant,
  projectDocumentProcessingRun,
  projectDocumentVersion,
  projectEvent,
  projectEvidenceRef,
  projectMembership,
  projectOperation,
  studyJourneyProject,
  user,
} from "@/lib/db/schema";
import type {
  AuthenticatedScanVerifier,
  ProjectDocumentEvidencePersistence,
  ProjectEvidenceCandidate,
  ProjectEvidenceRun,
  VerifiedEvidenceSource,
} from "./evidence";
import { ProjectEvidenceError } from "./evidence";

type Database = ReturnType<typeof getLazyDatabase>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function invalid(
  code: "forbidden" | "invalid_request" | "integrity_mismatch"
): never {
  const error = new Error(code);
  Object.assign(error, { code });
  throw error;
}

function candidateFromRow(
  row: typeof projectDocumentEvidenceUnit.$inferSelect
): ProjectEvidenceCandidate {
  return {
    ordinal: row.ordinal,
    locator: row.locator as ProjectEvidenceCandidate["locator"],
    excerpt: row.excerpt,
    excerptSha256: row.excerptSha256,
    extractionMethod: "native",
    provenance: row.provenance as ProjectEvidenceCandidate["provenance"],
  };
}

/**
 * Synchronous user-initiated extraction is audited as the acting customer.
 * Future async workers require a separately authorized service-principal audit
 * path instead of borrowing the initiating user's attribution.
 */
export class PostgresProjectDocumentEvidencePersistence
  implements ProjectDocumentEvidencePersistence
{
  private readonly database: Database;
  private readonly verifyAuthenticatedScan: AuthenticatedScanVerifier;

  constructor(
    database: Database,
    verifyAuthenticatedScan: AuthenticatedScanVerifier
  ) {
    this.database = database;
    this.verifyAuthenticatedScan = verifyAuthenticatedScan;
  }

  async findSource(input: {
    projectId: string;
    assetId: string;
    versionId: string;
  }): Promise<VerifiedEvidenceSource | null> {
    const [row] = await this.database
      .select({ asset: projectDocumentAsset, version: projectDocumentVersion })
      .from(projectDocumentAsset)
      .innerJoin(
        projectDocumentVersion,
        and(
          eq(projectDocumentVersion.projectId, projectDocumentAsset.projectId),
          eq(projectDocumentVersion.assetId, projectDocumentAsset.id)
        )
      )
      .where(
        and(
          eq(projectDocumentAsset.projectId, input.projectId),
          eq(projectDocumentAsset.id, input.assetId),
          eq(projectDocumentVersion.versionId, input.versionId)
        )
      )
      .limit(1);
    if (!row) {
      return null;
    }
    return {
      projectId: row.version.projectId,
      assetId: row.version.assetId,
      versionId: row.version.versionId,
      generation: row.version.processingGeneration,
      lifecycle: row.asset.lifecycle,
      storageStatus: row.version.storageStatus,
      securityStatus: row.version.securityStatus,
      storageKey: row.version.storageKey,
      objectVersionId: row.version.storageObjectVersionId,
      sha256: row.version.sha256,
      byteSize: row.version.byteSize,
      canonicalMime: row.version.canonicalMime,
    };
  }

  private async authorized(
    tx: Transaction,
    input: {
      actorUserId: string;
      projectId: string;
      assetId: string;
      versionId: string;
    }
  ) {
    const [project] = await tx
      .select({
        ownerUserId: studyJourneyProject.ownerUserId,
        status: studyJourneyProject.status,
      })
      .from(studyJourneyProject)
      .where(eq(studyJourneyProject.id, input.projectId))
      .for("update")
      .limit(1);
    const [actor] = await tx
      .select({ email: user.email, role: user.role })
      .from(user)
      .where(eq(user.id, input.actorUserId))
      .limit(1);
    if (
      !project ||
      project.status !== "active" ||
      !actor ||
      actor.role !== "user" ||
      guestRegex.test(actor.email)
    ) {
      return false;
    }
    let membershipOk = project.ownerUserId === input.actorUserId;
    if (!membershipOk) {
      const [membership] = await tx
        .select({ status: projectMembership.status })
        .from(projectMembership)
        .where(
          and(
            eq(projectMembership.projectId, input.projectId),
            eq(projectMembership.userId, input.actorUserId)
          )
        )
        .for("update")
        .limit(1);
      membershipOk = membership?.status === "active";
    }
    if (!membershipOk) {
      return false;
    }
    const [grant] = await tx
      .select({ id: projectDocumentGrant.id })
      .from(projectDocumentGrant)
      .where(
        and(
          eq(projectDocumentGrant.projectId, input.projectId),
          eq(projectDocumentGrant.assetId, input.assetId),
          eq(projectDocumentGrant.versionId, input.versionId),
          eq(projectDocumentGrant.granteeKind, "user"),
          eq(projectDocumentGrant.granteeUserId, input.actorUserId),
          eq(projectDocumentGrant.purpose, "extract"),
          isNull(projectDocumentGrant.revokedAt)
        )
      )
      .limit(1);
    if (!grant) {
      return false;
    }
    const [asset] = await tx
      .select({ lifecycle: projectDocumentAsset.lifecycle })
      .from(projectDocumentAsset)
      .where(
        and(
          eq(projectDocumentAsset.projectId, input.projectId),
          eq(projectDocumentAsset.id, input.assetId)
        )
      )
      .limit(1);
    return asset?.lifecycle === "active";
  }

  async canExtract(input: {
    actorUserId: string;
    projectId: string;
    assetId: string;
    versionId: string;
  }) {
    return this.database.transaction((tx) => this.authorized(tx, input));
  }

  private async loadRun(
    tx: Transaction,
    run: typeof projectDocumentProcessingRun.$inferSelect
  ): Promise<ProjectEvidenceRun> {
    const units = await tx
      .select()
      .from(projectDocumentEvidenceUnit)
      .where(
        and(
          eq(projectDocumentEvidenceUnit.projectId, run.projectId),
          eq(projectDocumentEvidenceUnit.processingRunId, run.id)
        )
      )
      .orderBy(projectDocumentEvidenceUnit.ordinal);
    const [version] = await tx
      .select({ assetId: projectDocumentVersion.assetId })
      .from(projectDocumentVersion)
      .where(
        and(
          eq(projectDocumentVersion.projectId, run.projectId),
          eq(projectDocumentVersion.versionId, run.versionId)
        )
      )
      .limit(1);
    const status =
      run.status === "failed"
        ? "failed"
        : run.verdict === "partial"
          ? "partial"
          : run.verdict === "unsupported"
            ? "unsupported"
            : "complete";
    return {
      id: run.id,
      projectId: run.projectId,
      assetId: version?.assetId ?? units[0]?.assetId ?? "",
      versionId: run.versionId,
      generation: run.generation,
      sourceSha256: run.objectSha256,
      parserVersion: run.providerCode,
      status,
      errorCode: run.errorCode,
      candidates: units.map(candidateFromRow),
    };
  }

  async findReplay(input: {
    projectId: string;
    versionId: string;
    generation: number;
    parserVersion: string;
    sourceSha256: string;
  }): Promise<ProjectEvidenceRun | null> {
    const [run] = await this.database
      .select()
      .from(projectDocumentProcessingRun)
      .where(
        and(
          eq(projectDocumentProcessingRun.projectId, input.projectId),
          eq(projectDocumentProcessingRun.versionId, input.versionId),
          eq(projectDocumentProcessingRun.generation, input.generation),
          eq(projectDocumentProcessingRun.operationKind, "extract"),
          eq(projectDocumentProcessingRun.providerCode, input.parserVersion),
          eq(projectDocumentProcessingRun.objectSha256, input.sourceSha256)
        )
      )
      .limit(1);
    return run
      ? this.database.transaction((tx) => this.loadRun(tx, run))
      : null;
  }

  async saveRun(input: {
    run: ProjectEvidenceRun;
    actorUserId: string;
    operationId: string;
    expectedProjectRevision: number;
  }): Promise<ProjectEvidenceRun> {
    const operationId = validateProjectOperationId(input.operationId);
    const request = {
      actorUserId: input.actorUserId,
      projectId: input.run.projectId,
      assetId: input.run.assetId,
      versionId: input.run.versionId,
      generation: input.run.generation,
      parserVersion: input.run.parserVersion,
      sourceSha256: input.run.sourceSha256,
      status: input.run.status,
      errorCode: input.run.errorCode,
    };
    const requestHash = hashProjectOperationRequest({
      operationType: "project_evidence_extract",
      ...request,
    });
    return this.database.transaction(async (tx) => {
      if (
        !(await this.authorized(tx, {
          actorUserId: input.actorUserId,
          projectId: input.run.projectId,
          assetId: input.run.assetId,
          versionId: input.run.versionId,
        }))
      ) {
        invalid("forbidden");
      }
      const [project] = await tx
        .select()
        .from(studyJourneyProject)
        .where(eq(studyJourneyProject.id, input.run.projectId))
        .for("update")
        .limit(1);
      if (!project) {
        invalid("forbidden");
      }
      const [prior] = await tx
        .select()
        .from(projectOperation)
        .where(
          and(
            eq(projectOperation.actorUserId, input.actorUserId),
            eq(projectOperation.operationType, "project_evidence_extract"),
            eq(projectOperation.operationId, operationId)
          )
        )
        .for("update")
        .limit(1);
      if (prior) {
        if (
          prior.requestHash !== requestHash ||
          prior.resultKind !== "document_extraction_run"
        ) {
          invalid("integrity_mismatch");
        }
        const [priorRun] = await tx
          .select()
          .from(projectDocumentProcessingRun)
          .where(
            and(
              eq(projectDocumentProcessingRun.projectId, input.run.projectId),
              eq(projectDocumentProcessingRun.id, prior.resultId)
            )
          )
          .limit(1);
        return priorRun
          ? this.loadRun(tx, priorRun)
          : invalid("integrity_mismatch");
      }
      if (project.revision !== input.expectedProjectRevision) {
        invalid("integrity_mismatch");
      }
      const [version] = await tx
        .select()
        .from(projectDocumentVersion)
        .where(
          and(
            eq(projectDocumentVersion.projectId, input.run.projectId),
            eq(projectDocumentVersion.assetId, input.run.assetId),
            eq(projectDocumentVersion.versionId, input.run.versionId),
            eq(
              projectDocumentVersion.processingGeneration,
              input.run.generation
            ),
            eq(projectDocumentVersion.sha256, input.run.sourceSha256),
            eq(projectDocumentVersion.storageStatus, "stored"),
            eq(projectDocumentVersion.securityStatus, "clean")
          )
        )
        .for("update")
        .limit(1);
      if (!version || !version.storageObjectVersionId) {
        invalid("integrity_mismatch");
      }
      const [operation] = await tx
        .insert(projectOperation)
        .values({
          actorUserId: input.actorUserId,
          actorKind: "user",
          operationType: "project_evidence_extract",
          operationId,
          requestHash,
          resultKind: "document_extraction_run",
          resultId: input.run.id,
        })
        .onConflictDoNothing()
        .returning();
      if (!operation) {
        invalid("integrity_mismatch");
      }
      const [run] = await tx
        .insert(projectDocumentProcessingRun)
        .values({
          id: input.run.id,
          projectId: input.run.projectId,
          versionId: input.run.versionId,
          generation: input.run.generation,
          operationKind: "extract",
          providerCode: input.run.parserVersion,
          providerEventId: null,
          initiatedByUserId: input.actorUserId,
          servicePrincipalCode: null,
          objectSha256: input.run.sourceSha256,
          eventFingerprint: requestHash,
          status: "started",
        })
        .returning();
      if (!run) {
        invalid("integrity_mismatch");
      }
      if (input.run.candidates.length > 500) {
        invalid("invalid_request");
      }
      if (input.run.candidates.length) {
        await tx.insert(projectDocumentEvidenceUnit).values(
          input.run.candidates.map((candidate) => ({
            projectId: input.run.projectId,
            assetId: input.run.assetId,
            versionId: input.run.versionId,
            processingRunId: input.run.id,
            generation: input.run.generation,
            ordinal: candidate.ordinal,
            parserVersion: input.run.parserVersion,
            locator: candidate.locator,
            excerpt: candidate.excerpt,
            excerptSha256: candidate.excerptSha256,
            provenance: candidate.provenance,
          }))
        );
      }
      const failed = input.run.status === "failed";
      const verdict = failed ? null : input.run.status;
      const errorCode = failed
        ? (input.run.errorCode ?? "processing_failed")
        : null;
      const [terminal] = await tx
        .update(projectDocumentProcessingRun)
        .set({
          status: failed ? "failed" : "completed",
          verdict,
          errorCode,
          completedAt: new Date(),
        })
        .where(
          and(
            eq(projectDocumentProcessingRun.id, input.run.id),
            eq(projectDocumentProcessingRun.status, "started")
          )
        )
        .returning();
      if (!terminal) {
        invalid("integrity_mismatch");
      }
      const nextRevision = project.revision + 1;
      const [updatedProject] = await tx
        .update(studyJourneyProject)
        .set({ revision: nextRevision, updatedAt: new Date() })
        .where(
          and(
            eq(studyJourneyProject.id, project.id),
            eq(studyJourneyProject.revision, project.revision),
            eq(studyJourneyProject.status, "active")
          )
        )
        .returning();
      if (!updatedProject) {
        invalid("integrity_mismatch");
      }
      await tx.insert(projectEvent).values({
        projectId: project.id,
        actorKind: "user",
        actorUserId: input.actorUserId,
        projectRevision: nextRevision,
        eventType: "project_evidence_extraction_completed",
        subjectKind: "document_extraction_run",
        subjectId: input.run.id,
        operationRecordId: operation.id,
      });
      return this.loadRun(tx, terminal);
    });
  }

  async findRunForReferenceIssue(input: {
    actorUserId: string;
    projectId: string;
    runId: string;
  }): Promise<ProjectEvidenceRun | null> {
    const [run] = await this.database
      .select()
      .from(projectDocumentProcessingRun)
      .where(
        and(
          eq(projectDocumentProcessingRun.id, input.runId),
          eq(projectDocumentProcessingRun.projectId, input.projectId),
          eq(projectDocumentProcessingRun.operationKind, "extract"),
          eq(projectDocumentProcessingRun.status, "completed")
        )
      )
      .limit(1);
    if (!run) {
      return null;
    }
    if (run.status === "started") {
      throw new ProjectEvidenceError("recovery_needed");
    }
    const [version] = await this.database
      .select()
      .from(projectDocumentVersion)
      .where(
        and(
          eq(projectDocumentVersion.projectId, input.projectId),
          eq(projectDocumentVersion.versionId, run.versionId)
        )
      )
      .limit(1);
    const [unit] = await this.database
      .select({ assetId: projectDocumentEvidenceUnit.assetId })
      .from(projectDocumentEvidenceUnit)
      .where(eq(projectDocumentEvidenceUnit.processingRunId, run.id))
      .limit(1);
    if (
      !version ||
      !unit ||
      !(await this.canExtract({
        actorUserId: input.actorUserId,
        projectId: input.projectId,
        assetId: unit.assetId,
        versionId: run.versionId,
      }))
    ) {
      return null;
    }
    const source = await this.findSource({
      projectId: input.projectId,
      assetId: unit.assetId,
      versionId: run.versionId,
    });
    const proof = source
      ? await this.verifyAuthenticatedScan({ source })
      : null;
    if (
      !source ||
      !proof ||
      proof.authenticated !== true ||
      proof.verdict !== "clean" ||
      proof.projectId !== source.projectId ||
      proof.versionId !== source.versionId ||
      proof.generation !== source.generation ||
      proof.objectVersionId !== source.objectVersionId ||
      proof.sha256 !== source.sha256
    ) {
      return null;
    }
    return this.database.transaction((tx) => this.loadRun(tx, run));
  }

  async issueReference(input: {
    actorUserId: string;
    projectId: string;
    runId: string;
    candidateOrdinal: number;
  }): Promise<string> {
    return this.database.transaction(async (tx) => {
      const [unit] = await tx
        .select()
        .from(projectDocumentEvidenceUnit)
        .where(
          and(
            eq(projectDocumentEvidenceUnit.projectId, input.projectId),
            eq(projectDocumentEvidenceUnit.processingRunId, input.runId),
            eq(projectDocumentEvidenceUnit.ordinal, input.candidateOrdinal)
          )
        )
        .limit(1);
      const [run] = await tx
        .select()
        .from(projectDocumentProcessingRun)
        .where(
          and(
            eq(projectDocumentProcessingRun.projectId, input.projectId),
            eq(projectDocumentProcessingRun.id, input.runId),
            eq(projectDocumentProcessingRun.operationKind, "extract"),
            eq(projectDocumentProcessingRun.status, "completed")
          )
        )
        .limit(1);
      if (
        !unit ||
        !run ||
        !(await this.authorized(tx, {
          actorUserId: input.actorUserId,
          projectId: input.projectId,
          assetId: unit.assetId,
          versionId: run.versionId,
        }))
      ) {
        invalid("forbidden");
      }
      const source = await this.findSource({
        projectId: input.projectId,
        assetId: unit.assetId,
        versionId: run.versionId,
      });
      const proof = source
        ? await this.verifyAuthenticatedScan({ source })
        : null;
      if (
        !source ||
        !proof ||
        proof.authenticated !== true ||
        proof.verdict !== "clean" ||
        proof.projectId !== source.projectId ||
        proof.versionId !== source.versionId ||
        proof.generation !== source.generation ||
        proof.objectVersionId !== source.objectVersionId ||
        proof.sha256 !== source.sha256
      ) {
        invalid("forbidden");
      }
      const [ref] = await tx
        .insert(projectEvidenceRef)
        .values({
          projectId: input.projectId,
          processingRunId: input.runId,
          unitId: unit.id,
          createdByUserId: input.actorUserId,
        })
        .onConflictDoNothing()
        .returning();
      if (ref) {
        return ref.id;
      }
      const [existing] = await tx
        .select()
        .from(projectEvidenceRef)
        .where(
          and(
            eq(projectEvidenceRef.projectId, input.projectId),
            eq(projectEvidenceRef.unitId, unit.id),
            isNull(projectEvidenceRef.revokedAt)
          )
        )
        .limit(1);
      return existing?.id ?? invalid("integrity_mismatch");
    });
  }

  async resolveReference(input: {
    actorUserId: string;
    projectId: string;
    evidenceRef: string;
  }) {
    const [row] = await this.database
      .select({
        ref: projectEvidenceRef,
        unit: projectDocumentEvidenceUnit,
        run: projectDocumentProcessingRun,
      })
      .from(projectEvidenceRef)
      .innerJoin(
        projectDocumentEvidenceUnit,
        and(
          eq(
            projectDocumentEvidenceUnit.projectId,
            projectEvidenceRef.projectId
          ),
          eq(projectDocumentEvidenceUnit.id, projectEvidenceRef.unitId),
          eq(
            projectDocumentEvidenceUnit.processingRunId,
            projectEvidenceRef.processingRunId
          )
        )
      )
      .innerJoin(
        projectDocumentProcessingRun,
        and(
          eq(
            projectDocumentProcessingRun.projectId,
            projectDocumentEvidenceUnit.projectId
          ),
          eq(
            projectDocumentProcessingRun.id,
            projectDocumentEvidenceUnit.processingRunId
          )
        )
      )
      .where(
        and(
          eq(projectEvidenceRef.projectId, input.projectId),
          eq(projectEvidenceRef.id, input.evidenceRef),
          isNull(projectEvidenceRef.revokedAt),
          eq(projectDocumentProcessingRun.operationKind, "extract"),
          eq(projectDocumentProcessingRun.status, "completed")
        )
      )
      .limit(1);
    if (
      !row ||
      !(await this.canExtract({
        actorUserId: input.actorUserId,
        projectId: input.projectId,
        assetId: row.unit.assetId,
        versionId: row.run.versionId,
      }))
    ) {
      return null;
    }
    const source = await this.findSource({
      projectId: input.projectId,
      assetId: row.unit.assetId,
      versionId: row.run.versionId,
    });
    const proof = source
      ? await this.verifyAuthenticatedScan({ source })
      : null;
    if (
      !source ||
      !proof ||
      proof.authenticated !== true ||
      proof.verdict !== "clean" ||
      proof.projectId !== source.projectId ||
      proof.versionId !== source.versionId ||
      proof.objectVersionId !== source.objectVersionId ||
      proof.sha256 !== source.sha256 ||
      proof.generation !== source.generation
    ) {
      return null;
    }
    const run = await this.database.transaction((tx) =>
      this.loadRun(tx, row.run)
    );
    const candidate = run.candidates.find(
      (item) => item.ordinal === row.unit.ordinal
    );
    return candidate ? { run, candidate } : null;
  }
}
