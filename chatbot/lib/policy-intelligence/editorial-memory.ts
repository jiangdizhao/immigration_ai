// biome-ignore-all lint/suspicious/useAwait: the in-memory repository mirrors the async port signatures exactly.
import type { PolicyEvidencePacketItem } from "./contracts";
import {
  POLICY_ANALYSIS_SCHEMA,
  POLICY_HUMAN_REVISION_SCHEMA,
} from "./contracts";
import type {
  EditorialActor,
  EditorialAuditRow,
  EditorialDraftSnapshotRow,
  EditorialGrantRow,
  EditorialItemRow,
  EditorialRevisionRow,
  EditorialSourceSnapshotRow,
  OperatorSubmissionRow,
  PolicyEditorialRepository,
  PolicyEditorialTx,
} from "./editorial-core";
import type {
  OperatorSubmissionRepository,
  OperatorSubmissionTx,
} from "./operator-submission";

/**
 * In-memory editorial repository for unit tests.
 *
 * `run` executes the callback directly: tests are single-threaded, so the
 * optimistic-concurrency contract is exercised through the stored version
 * values rather than through real database locks.
 */

export type InMemoryEditorialStore = {
  actors: Map<string, EditorialActor>;
  grants: Map<
    string,
    {
      grantedByUserId: string;
      grantedAt: Date;
      revokedByUserId: string | null;
      revokedAt: Date | null;
    }
  >;
  items: Map<string, EditorialItemRow>;
  revisions: Map<string, EditorialRevisionRow>;
  draftSnapshots: Map<string, EditorialDraftSnapshotRow>;
  audit: EditorialAuditRow[];
  evidence: Map<string, PolicyEvidencePacketItem>;
  /** Phase 12 Stage 3 — persisted official source snapshots by snapshot id. */
  sourceSnapshots: Map<string, EditorialSourceSnapshotRow>;
  sequence: { value: number };
  nextId(): string;
};

export function createInMemoryEditorialStore(): InMemoryEditorialStore {
  const store: InMemoryEditorialStore = {
    actors: new Map(),
    grants: new Map(),
    items: new Map(),
    revisions: new Map(),
    draftSnapshots: new Map(),
    audit: [],
    evidence: new Map(),
    sourceSnapshots: new Map(),
    sequence: { value: 0 },
    nextId() {
      store.sequence.value += 1;
      // UUID-shaped (v4/variant-8) ids so the same fixtures can be driven
      // through the HTTP contract, which validates uuid syntax.
      const suffix = store.sequence.value.toString(16).padStart(12, "0");
      return `00000000-0000-4000-8000-${suffix}`;
    },
  };
  return store;
}

/** Seeds one persisted official source snapshot for the in-memory tests. */
export function seedEditorialSourceSnapshot(
  store: InMemoryEditorialStore,
  snapshot: EditorialSourceSnapshotRow
): EditorialSourceSnapshotRow {
  store.sourceSnapshots.set(snapshot.id, snapshot);
  return snapshot;
}

export function seedEditorialActor(
  store: InMemoryEditorialStore,
  actor: EditorialActor
): EditorialActor {
  store.actors.set(actor.userId, actor);
  return actor;
}

export function seedEditorialGrant(
  store: InMemoryEditorialStore,
  userId: string,
  grantedByUserId: string,
  grantedAt = new Date("2026-10-01T00:00:00.000Z")
): void {
  store.grants.set(userId, {
    grantedByUserId,
    grantedAt,
    revokedByUserId: null,
    revokedAt: null,
  });
}

export function seedEditorialItem(
  store: InMemoryEditorialStore,
  input: Partial<EditorialItemRow> & Pick<EditorialItemRow, "slug">
): EditorialItemRow {
  const item: EditorialItemRow = {
    id: input.id ?? store.nextId(),
    slug: input.slug,
    origin: input.origin ?? "automated",
    editorialStatus: input.editorialStatus ?? "draft",
    sourceStatus: input.sourceStatus ?? "announced",
    latestSnapshotId: input.latestSnapshotId ?? null,
    latestPublishedRevisionId: input.latestPublishedRevisionId ?? null,
    createdByUserId: input.createdByUserId ?? null,
    publicationMode: input.publicationMode ?? "automatic",
    protectionSetAt: input.protectionSetAt ?? null,
    protectionSetByUserId: input.protectionSetByUserId ?? null,
    updatedAt: input.updatedAt ?? new Date("2026-10-01T00:00:00.000Z"),
  };
  store.items.set(item.id, item);
  return item;
}

export function seedEditorialRevision(
  store: InMemoryEditorialStore,
  input: Partial<EditorialRevisionRow> &
    Pick<EditorialRevisionRow, "itemId" | "revisionNumber">
): EditorialRevisionRow {
  const revision: EditorialRevisionRow = {
    id: input.id ?? store.nextId(),
    itemId: input.itemId,
    snapshotId: input.snapshotId ?? null,
    contentKind: input.contentKind ?? "ai_analysis",
    analysisFingerprint: input.analysisFingerprint ?? store.nextId(),
    revisionNumber: input.revisionNumber,
    editorialStatus: input.editorialStatus ?? "review_required",
    analysis: input.analysis ?? null,
    verification: input.verification ?? null,
    humanContent: input.humanContent ?? null,
    aiDecision: input.aiDecision ?? null,
    overrideReason: input.overrideReason ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    baseRevisionId: input.baseRevisionId ?? null,
    createdByUserId: input.createdByUserId ?? null,
    generatedAt: input.generatedAt ?? new Date("2026-10-01T00:00:00.000Z"),
    publishedAt: input.publishedAt ?? null,
    supersededAt: input.supersededAt ?? null,
    createdAt: input.createdAt ?? new Date("2026-10-01T00:00:00.000Z"),
  };
  store.revisions.set(revision.id, revision);
  return revision;
}

function createTx(store: InMemoryEditorialStore): PolicyEditorialTx {
  return {
    async getActor(userId) {
      return store.actors.get(userId) ?? null;
    },
    async isActivePolicyEditor(userId) {
      const grant = store.grants.get(userId);
      return Boolean(grant && grant.revokedAt === null);
    },
    async getItemForUpdate(itemId) {
      return store.items.get(itemId) ?? null;
    },
    async findItemBySlug(slug) {
      for (const item of store.items.values()) {
        if (item.slug === slug) {
          return item;
        }
      }
      return null;
    },
    async getRevisionForUpdate(revisionId) {
      return store.revisions.get(revisionId) ?? null;
    },
    async listRevisions(itemId) {
      return [...store.revisions.values()]
        .filter((revision) => revision.itemId === itemId)
        .sort((left, right) => left.revisionNumber - right.revisionNumber);
    },
    async maxRevisionNumber(itemId) {
      return [...store.revisions.values()]
        .filter((revision) => revision.itemId === itemId)
        .reduce((max, revision) => Math.max(max, revision.revisionNumber), 0);
    },
    async findRevisionByIdempotencyKey(itemId, idempotencyKey) {
      for (const revision of store.revisions.values()) {
        if (
          revision.itemId === itemId &&
          revision.idempotencyKey === idempotencyKey
        ) {
          return revision;
        }
      }
      return null;
    },
    async getSnapshotEvidence(snapshotId) {
      return store.evidence.get(snapshotId) ?? null;
    },
    async getSourceSnapshotForItem({ itemId, snapshotId }) {
      const candidates = [...store.sourceSnapshots.values()]
        .filter((snapshot) => snapshot.itemId === itemId)
        .sort((left, right) =>
          right.retrievedAt.localeCompare(left.retrievedAt)
        );
      if (snapshotId) {
        const pointed = candidates.find(
          (snapshot) => snapshot.id === snapshotId
        );
        if (pointed) {
          return pointed;
        }
      }
      return candidates[0] ?? null;
    },
    async insertItem(values) {
      const item: EditorialItemRow = {
        id: store.nextId(),
        slug: values.slug,
        origin: values.origin,
        editorialStatus: values.editorialStatus,
        sourceStatus: values.sourceStatus,
        latestSnapshotId: null,
        latestPublishedRevisionId: null,
        createdByUserId: values.createdByUserId,
        publicationMode: "automatic",
        protectionSetAt: null,
        protectionSetByUserId: null,
        updatedAt: new Date(),
      };
      store.items.set(item.id, item);
      return item;
    },
    async insertItemIfSlugAvailable(values) {
      for (const item of store.items.values()) {
        if (item.slug === values.slug) {
          return { status: "slug_taken" as const };
        }
      }
      return {
        status: "created" as const,
        item: await this.insertItem(values),
      };
    },
    async insertDraftSnapshot(values) {
      const snapshot: EditorialDraftSnapshotRow = {
        id: store.nextId(),
        itemId: values.itemId,
        revisionId: values.revisionId,
        saveNumber: values.saveNumber,
        contentVersion: values.contentVersion,
        contentDigest: values.contentDigest,
        humanContent: values.humanContent,
        contentBytes: values.contentBytes,
        savedByUserId: values.savedByUserId,
        createdAt: values.now,
      };
      store.draftSnapshots.set(snapshot.id, snapshot);
      return snapshot;
    },
    async listDraftSnapshots(revisionId, limit) {
      return [...store.draftSnapshots.values()]
        .filter((snapshot) => snapshot.revisionId === revisionId)
        .sort((left, right) => left.saveNumber - right.saveNumber)
        .slice(0, Math.max(1, Math.min(200, limit)));
    },
    async deleteDraftSnapshots(ids) {
      for (const id of ids) {
        store.draftSnapshots.delete(id);
      }
    },
    async insertRevision(values) {
      const revision: EditorialRevisionRow = {
        id: store.nextId(),
        itemId: values.itemId,
        snapshotId: values.snapshotId,
        contentKind: values.contentKind,
        analysisFingerprint: values.analysisFingerprint,
        revisionNumber: values.revisionNumber,
        editorialStatus: values.editorialStatus,
        analysis: null,
        verification: null,
        humanContent: values.humanContent,
        aiDecision: values.aiDecision,
        overrideReason: values.overrideReason,
        idempotencyKey: values.idempotencyKey,
        baseRevisionId: values.baseRevisionId,
        createdByUserId: values.createdByUserId,
        generatedAt: new Date(values.generatedAt),
        publishedAt: values.publishedAt ? new Date(values.publishedAt) : null,
        supersededAt: null,
        createdAt: new Date(),
        schemaVersion:
          values.schemaVersion ??
          (values.contentKind === "ai_analysis"
            ? POLICY_ANALYSIS_SCHEMA
            : POLICY_HUMAN_REVISION_SCHEMA),
        modelMetadata: values.modelMetadata ?? null,
      };
      store.revisions.set(revision.id, revision);
      return revision;
    },
    async updateItem(itemId, values) {
      const item = store.items.get(itemId);
      if (!item) {
        return;
      }
      store.items.set(itemId, {
        ...item,
        ...(values.editorialStatus !== undefined
          ? { editorialStatus: values.editorialStatus }
          : {}),
        ...(values.sourceStatus !== undefined
          ? { sourceStatus: values.sourceStatus }
          : {}),
        ...(values.latestPublishedRevisionId !== undefined
          ? { latestPublishedRevisionId: values.latestPublishedRevisionId }
          : {}),
        ...(values.publicationMode !== undefined
          ? { publicationMode: values.publicationMode }
          : {}),
        ...(values.protectionSetAt !== undefined
          ? { protectionSetAt: values.protectionSetAt }
          : {}),
        ...(values.protectionSetByUserId !== undefined
          ? { protectionSetByUserId: values.protectionSetByUserId }
          : {}),
        updatedAt: values.updatedAt ?? new Date(),
      });
    },
    async updateRevision(revisionId, values) {
      const revision = store.revisions.get(revisionId);
      if (!revision) {
        return;
      }
      store.revisions.set(revisionId, {
        ...revision,
        ...(values.editorialStatus !== undefined
          ? { editorialStatus: values.editorialStatus }
          : {}),
        ...(values.publishedAt !== undefined
          ? { publishedAt: values.publishedAt }
          : {}),
        ...(values.supersededAt !== undefined
          ? { supersededAt: values.supersededAt }
          : {}),
        ...(values.humanContent !== undefined
          ? { humanContent: values.humanContent }
          : {}),
        ...(values.analysisFingerprint !== undefined
          ? { analysisFingerprint: values.analysisFingerprint }
          : {}),
        ...(values.idempotencyKey !== undefined
          ? { idempotencyKey: values.idempotencyKey }
          : {}),
      });
    },
    async appendAuditEvent(values) {
      store.audit.push({
        id: store.nextId(),
        actorUserId: values.actorUserId,
        action: values.action,
        itemId: values.itemId,
        revisionId: values.revisionId,
        overrideReason: values.overrideReason,
        detail: values.detail,
        createdAt: new Date(),
      });
    },
    async activatePolicyEditorGrant(values) {
      const existing = store.grants.get(values.userId);
      store.grants.set(values.userId, {
        grantedByUserId: values.adminUserId,
        grantedAt: values.now,
        revokedByUserId: null,
        revokedAt: null,
      });
      return { reactivated: Boolean(existing && existing.revokedAt !== null) };
    },
    async revokePolicyEditorGrant(values) {
      // R3 P0: update-only. A user who was never granted permission is never
      // given a record here, so revoke can never create an active grant.
      const existing = store.grants.get(values.userId);
      if (!existing) {
        return "not_granted" as const;
      }
      if (existing.revokedAt !== null) {
        return "already_revoked" as const;
      }
      store.grants.set(values.userId, {
        ...existing,
        revokedByUserId: values.adminUserId,
        revokedAt: values.now,
      });
      return "revoked" as const;
    },
  };
}

export function createInMemoryEditorialRepository(
  store: InMemoryEditorialStore
): PolicyEditorialRepository {
  return {
    async run(work) {
      return await work(createTx(store));
    },
    async listEditorialItems(limit, offset) {
      return [...store.items.values()]
        .sort((left, right) => {
          const byUpdated =
            new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime();
          if (byUpdated !== 0) {
            return byUpdated;
          }
          return right.id.localeCompare(left.id);
        })
        .slice(Math.max(0, offset), Math.max(0, offset) + Math.max(1, limit));
    },
    async listRevisionsForItems(itemIds) {
      const set = new Set(itemIds);
      return [...store.revisions.values()].filter((revision) =>
        set.has(revision.itemId)
      );
    },
    async loadItemDetail(itemId) {
      const item = store.items.get(itemId);
      if (!item) {
        return null;
      }
      const revisions = [...store.revisions.values()].filter(
        (revision) => revision.itemId === itemId
      );
      const snapshotRevision = [...revisions]
        .filter((revision) => revision.snapshotId !== null)
        .sort((left, right) => right.revisionNumber - left.revisionNumber)[0];
      const evidence = snapshotRevision?.snapshotId
        ? store.evidence.get(snapshotRevision.snapshotId)
        : undefined;
      return {
        item,
        revisions,
        audit: store.audit.filter((event) => event.itemId === itemId),
        snapshot: evidence
          ? {
              authority: evidence.authority,
              officialTitle: evidence.officialTitle,
              canonicalUrl: evidence.canonicalUrl,
              sourceDate: evidence.sourceDate,
            }
          : null,
      };
    },
    async listAuditEvents(itemId, limit) {
      return store.audit
        .filter((event) => event.itemId === itemId)
        .slice(0, Math.max(1, limit));
    },
    async listPolicyEditorGrants() {
      const grants: EditorialGrantRow[] = [];
      for (const [userId, grant] of store.grants.entries()) {
        grants.push({
          userId,
          email: store.actors.get(userId)?.email ?? `${userId}@example.test`,
          grantedByUserId: grant.grantedByUserId,
          grantedAt: grant.grantedAt,
          revokedByUserId: grant.revokedByUserId,
          revokedAt: grant.revokedAt,
        });
      }
      return grants;
    },
    async findUserByEmail(email) {
      const normalized = email.trim().toLowerCase();
      for (const actor of store.actors.values()) {
        if (actor.email.toLowerCase() === normalized) {
          return actor;
        }
      }
      return null;
    },
  };
}

/* ---------------------------------------------------------------------- */
/* Operator submissions                                                   */
/* ---------------------------------------------------------------------- */

export type InMemoryOperatorSubmissionStore = {
  submissions: OperatorSubmissionRow[];
  actors: Map<string, EditorialActor>;
  grants: Map<string, { revokedAt: Date | null }>;
  audit: EditorialAuditRow[];
  sequence: { value: number };
};

export function createInMemoryOperatorSubmissionStore(): InMemoryOperatorSubmissionStore {
  return {
    submissions: [],
    actors: new Map(),
    grants: new Map(),
    audit: [],
    sequence: { value: 0 },
  };
}

export function createInMemoryOperatorSubmissionRepository(
  store: InMemoryOperatorSubmissionStore
): OperatorSubmissionRepository {
  const tx: OperatorSubmissionTx = {
    async getActor(userId) {
      return store.actors.get(userId) ?? null;
    },
    async isActivePolicyEditor(userId) {
      const grant = store.grants.get(userId);
      return Boolean(grant && grant.revokedAt === null);
    },
    async findPendingSubmissionByUrl(submittedUrl) {
      return (
        store.submissions.find(
          (submission) =>
            submission.submittedUrl === submittedUrl &&
            submission.status === "pending"
        ) ?? null
      );
    },
    async insertSubmission(values) {
      store.sequence.value += 1;
      const row: OperatorSubmissionRow = {
        id: `submission-${store.sequence.value}`,
        submittedUrl: values.submittedUrl,
        submittedByUserId: values.submittedByUserId,
        note: values.note,
        status: "pending",
        errorCode: null,
        createdAt: values.now,
      };
      store.submissions.push(row);
      return row;
    },
    async appendAuditEvent(values) {
      store.audit.push({
        id: `audit-${store.audit.length + 1}`,
        actorUserId: values.actorUserId,
        action: values.action,
        itemId: values.itemId,
        revisionId: values.revisionId,
        overrideReason: values.overrideReason,
        detail: values.detail,
        createdAt: new Date(),
      });
    },
  };
  return {
    async run(work) {
      return await work(tx);
    },
    async listSubmissions(limit) {
      return store.submissions.slice(0, Math.max(1, limit));
    },
    async listPendingSubmissions(limit) {
      return store.submissions
        .filter((submission) => submission.status === "pending")
        .slice(0, Math.max(1, limit));
    },
    async markSubmission({ id, status, errorCode }) {
      const submission = store.submissions.find((row) => row.id === id);
      if (submission) {
        submission.status = status;
        submission.errorCode = errorCode;
      }
    },
  };
}
