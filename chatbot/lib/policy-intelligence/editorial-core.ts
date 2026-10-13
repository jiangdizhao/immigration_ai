import { createHash } from "node:crypto";
import { POLICY_SLUG_PATTERN } from "../policy-intelligence-product";
import {
  POLICY_HUMAN_REVISION_SCHEMA,
  POLICY_SOURCE_FIRST_SCHEMA,
  type PolicyEvidencePacketItem,
  type PolicyHumanRevisionContent,
  policyHumanRevisionContentSchema,
} from "./contracts";

/**
 * Phase 12 Stage 3 — lawyer editorial core.
 *
 * This module contains the deterministic editorial workflows (manual
 * authoring, lawyer override/force publish, archive/restore, capability
 * grants, audit, official-URL submission) over an injected transactional
 * repository port. It has **no** provider, model, retrieval or crawler
 * dependency by construction: an AI analyzer/verifier failure, hold verdict or
 * publication-gate rejection can never appear in this file as a veto.
 */

export const EDITORIAL_ITEM_LIMIT = 100;
/**
 * Phase 12 Stage 3 R1 — bounded pagination for the editorial workspace. The
 * legacy single hard limit of 100 made older held/manual items unreachable, so
 * the workspace now pages deterministically (updatedAt desc, id desc).
 */
export const EDITORIAL_ITEM_DEFAULT_PAGE = 50;
export const EDITORIAL_ITEM_MAX_PAGE = 200;
export const EDITORIAL_AUDIT_LIMIT = 50;
/**
 * Phase 12 Stage 3 R2/R3 — bounded retention for human draft recovery.
 *
 * Every draft save appends the complete document; the oldest snapshots of that
 * revision are pruned beyond these limits (the newest save is never pruned).
 * This is a **bounded recovery window**, not permanent complete draft history:
 * 25 saves / 2 MB of serialized content per revision keeps recent bilingual
 * documents exactly recoverable at a predictable storage cost, and the UI says
 * so explicitly.
 */
export const DRAFT_SNAPSHOT_MAX_PER_REVISION = 25;
export const DRAFT_SNAPSHOT_MAX_BYTES_PER_REVISION = 2_000_000;
export const OPERATOR_SUBMISSION_LIMIT = 25;
export const OPERATOR_URL_MAX_LENGTH = 2000;
/** Bounded audit diff size (bytes of serialized change set) for draft edits. */
export const EDITORIAL_AUDIT_DIFF_LIMIT_BYTES = 8000;

export type EditorialItemStatus =
  | "draft"
  | "review_required"
  | "published"
  | "archived";

export type EditorialRevisionStatus =
  | "draft"
  | "review_required"
  | "published"
  | "superseded"
  | "archived";

export type EditorialContentKind =
  | "ai_analysis"
  | "lawyer_override"
  | "lawyer_authored"
  // Phase 12 Stage 3 D-072: a published source-first notice. Editorial writes
  // never create this kind, but stored rows of this kind must be representable.
  | "source_first";

export type EditorialErrorCode =
  | "unauthenticated"
  | "capability_required"
  | "admin_required"
  | "identity_not_verified"
  | "publication_authority_required"
  | "grant_target_not_eligible"
  | "validation_failed"
  | "item_not_found"
  | "item_not_archived"
  | "user_not_found"
  | "revision_not_found"
  | "item_archived"
  | "not_a_draft"
  | "stale_draft_conflict"
  | "stale_publication_conflict"
  | "stale_base_revision_conflict"
  | "revision_not_overridable"
  | "idempotency_key_reused"
  | "not_manual_origin"
  | "slug_unavailable"
  | "duplicate_submission"
  | "invalid_official_url";

export type EditorialError = {
  status: "error";
  code: EditorialErrorCode;
  detail?: string;
};

export type EditorialResult<T> = { status: "ok"; value: T } | EditorialError;

export function editorialError(
  code: EditorialErrorCode,
  detail?: string
): EditorialError {
  return detail === undefined
    ? { status: "error", code }
    : { status: "error", code, detail };
}

export type EditorialActor = {
  userId: string;
  role: "user" | "lawyer" | "admin";
  email: string;
  /**
   * Server-authoritative identity verification. A grant held by an unverified
   * account is never sufficient for publication authority (D-065 R1).
   */
  emailVerifiedAt: Date | string | null;
};

export type EditorialPublicationMode = "automatic" | "human_protected";

export type EditorialItemRow = {
  id: string;
  slug: string;
  origin: "automated" | "manual";
  editorialStatus: EditorialItemStatus;
  sourceStatus: string;
  latestSnapshotId: string | null;
  latestPublishedRevisionId: string | null;
  createdByUserId: string | null;
  /** Durable human-publication protection state (Phase 12 Stage 3 R1). */
  publicationMode: EditorialPublicationMode;
  protectionSetAt: Date | string | null;
  protectionSetByUserId: string | null;
  updatedAt: Date | string;
};

/**
 * Phase 12 Stage 3 — the persisted official source snapshot an editor may
 * publish directly. Only structural provenance is exposed: the snapshot row
 * identity, the official title/URL/dates already stored by the acquisition, and
 * the recorded source metadata used to derive an honest status.
 */
export type EditorialSourceSnapshotRow = {
  id: string;
  itemId: string;
  authority: string;
  canonicalUrl: string;
  officialTitle: string;
  sourceDate: string | null;
  effectiveDate: string | null;
  sourceMetadata: unknown;
  retrievedAt: string;
};

export type EditorialRevisionRow = {
  id: string;
  itemId: string;
  snapshotId: string | null;
  contentKind: EditorialContentKind;
  analysisFingerprint: string;
  revisionNumber: number;
  editorialStatus: EditorialRevisionStatus;
  analysis: unknown | null;
  verification: unknown | null;
  humanContent: unknown | null;
  aiDecision: unknown | null;
  overrideReason: string | null;
  idempotencyKey: string | null;
  baseRevisionId: string | null;
  createdByUserId: string | null;
  generatedAt: Date | string;
  publishedAt: Date | string | null;
  supersededAt: Date | string | null;
  createdAt: Date | string;
  /**
   * Phase 12 Stage 3 — stored revision schema version and (source-first)
   * metadata. Optional so existing editorial fixtures stay valid.
   */
  schemaVersion?: string;
  modelMetadata?: unknown | null;
};

export type EditorialAuditRow = {
  id: string;
  actorUserId: string;
  action: string;
  itemId: string | null;
  revisionId: string | null;
  overrideReason: string | null;
  detail: Record<string, unknown>;
  createdAt: Date | string;
};

export type EditorialDraftSnapshotRow = {
  id: string;
  itemId: string;
  revisionId: string;
  saveNumber: number;
  contentVersion: string;
  contentDigest: string;
  humanContent: unknown;
  contentBytes: number;
  savedByUserId: string;
  createdAt: Date | string;
};

export type EditorialGrantRow = {
  userId: string;
  email: string;
  grantedByUserId: string;
  grantedAt: Date | string;
  revokedByUserId: string | null;
  revokedAt: Date | string | null;
};

/**
 * R3 P0 — controlled outcome of a revoke attempt. `not_granted` and
 * `already_revoked` are audited no-ops: neither ever creates an active grant.
 */
export type PolicyEditorGrantRevokeOutcome =
  | "revoked"
  | "already_revoked"
  | "not_granted";

export type OperatorSubmissionRow = {
  id: string;
  submittedUrl: string;
  submittedByUserId: string;
  note: string | null;
  status: "pending" | "consumed" | "failed" | "rejected";
  errorCode: string | null;
  createdAt: Date | string;
};

export type PolicyEditorialTx = {
  getActor(userId: string): Promise<EditorialActor | null>;
  isActivePolicyEditor(userId: string): Promise<boolean>;
  getItemForUpdate(itemId: string): Promise<EditorialItemRow | null>;
  findItemBySlug(slug: string): Promise<EditorialItemRow | null>;
  getRevisionForUpdate(
    revisionId: string
  ): Promise<EditorialRevisionRow | null>;
  listRevisions(itemId: string): Promise<EditorialRevisionRow[]>;
  maxRevisionNumber(itemId: string): Promise<number>;
  findRevisionByIdempotencyKey(
    itemId: string,
    idempotencyKey: string
  ): Promise<EditorialRevisionRow | null>;
  getSnapshotEvidence(
    snapshotId: string
  ): Promise<PolicyEvidencePacketItem | null>;
  /**
   * Phase 12 Stage 3 — resolve the persisted official snapshot an editor may
   * publish directly: the item's current `latestSnapshotId` when given (the
   * pipeline's own eligibility pointer), otherwise the newest stored snapshot
   * for the item. Returns null when the item has no persisted snapshot.
   */
  getSourceSnapshotForItem(input: {
    itemId: string;
    snapshotId: string | null;
  }): Promise<EditorialSourceSnapshotRow | null>;
  insertItem(values: {
    slug: string;
    origin: "automated" | "manual";
    editorialStatus: EditorialItemStatus;
    sourceStatus: string;
    createdByUserId: string | null;
  }): Promise<EditorialItemRow>;
  /**
   * Phase 12 Stage 3 R2 — insert an item only when the slug is still free.
   *
   * Two concurrent creates with the same slug must not raise an uncaught
   * database error: the insert resolves to `slug_taken` instead (the caller then
   * either resolves an idempotent replay or returns a controlled conflict).
   */
  insertItemIfSlugAvailable(values: {
    slug: string;
    origin: "automated" | "manual";
    editorialStatus: EditorialItemStatus;
    sourceStatus: string;
    createdByUserId: string | null;
  }): Promise<
    { status: "created"; item: EditorialItemRow } | { status: "slug_taken" }
  >;
  insertRevision(values: {
    itemId: string;
    snapshotId: string | null;
    contentKind: EditorialContentKind;
    analysisFingerprint: string;
    revisionNumber: number;
    editorialStatus: EditorialRevisionStatus;
    humanContent: PolicyHumanRevisionContent | null;
    aiDecision: Record<string, unknown> | null;
    overrideReason: string | null;
    idempotencyKey: string | null;
    baseRevisionId: string | null;
    createdByUserId: string | null;
    generatedAt: string;
    publishedAt: string | null;
    /**
     * Phase 12 Stage 3 — a directly published official source snapshot stores
     * its own schema version and the source-first metadata (reason/advisories)
     * that the public projection reads. Existing callers omit both.
     */
    schemaVersion?: string;
    modelMetadata?: Record<string, unknown> | null;
  }): Promise<EditorialRevisionRow>;
  updateItem(
    itemId: string,
    values: Partial<{
      editorialStatus: EditorialItemStatus;
      sourceStatus: string;
      latestPublishedRevisionId: string | null;
      publicationMode: EditorialPublicationMode;
      protectionSetAt: Date | null;
      protectionSetByUserId: string | null;
      updatedAt: Date;
    }>
  ): Promise<void>;
  updateRevision(
    revisionId: string,
    values: Partial<{
      editorialStatus: EditorialRevisionStatus;
      publishedAt: Date | null;
      supersededAt: Date | null;
      humanContent: PolicyHumanRevisionContent | null;
      analysisFingerprint: string;
      idempotencyKey: string | null;
    }>
  ): Promise<void>;
  appendAuditEvent(values: {
    actorUserId: string;
    action: string;
    itemId: string | null;
    revisionId: string | null;
    overrideReason: string | null;
    detail: Record<string, unknown>;
  }): Promise<void>;
  /**
   * Phase 12 Stage 3 R2 — append one complete, immutable save of a human draft.
   * Returns the stored row (including the save number assigned in-transaction).
   */
  insertDraftSnapshot(values: {
    itemId: string;
    revisionId: string;
    saveNumber: number;
    contentVersion: string;
    contentDigest: string;
    humanContent: PolicyHumanRevisionContent;
    contentBytes: number;
    savedByUserId: string;
    now: Date;
  }): Promise<EditorialDraftSnapshotRow>;
  /** Retained snapshots of one revision, oldest first (bounded). */
  listDraftSnapshots(
    revisionId: string,
    limit: number
  ): Promise<EditorialDraftSnapshotRow[]>;
  /** Bounded retention prune: removes only the given oldest snapshot ids. */
  deleteDraftSnapshots(ids: string[]): Promise<void>;
  /**
   * R3 P0 — grant/revoke are two separate, explicit intents.
   *
   * The previous single `upsertPolicyEditorGrant({ revoked })` method inserted
   * `revokedAt: null` and only applied revoke semantics through
   * `onConflictDoUpdate`, so revoking a user with no existing row *created an
   * active grant*. Splitting the intents removes that failure mode structurally:
   * activation can create/reactivate, revocation can only ever update an
   * existing row.
   */
  activatePolicyEditorGrant(values: {
    userId: string;
    adminUserId: string;
    now: Date;
  }): Promise<{ reactivated: boolean }>;
  /**
   * Revokes an existing grant. Update-only: it never inserts a grant, so a
   * revoke can never grant permission. Returns a controlled outcome for the
   * service to audit/report honestly.
   */
  revokePolicyEditorGrant(values: {
    userId: string;
    adminUserId: string;
    now: Date;
  }): Promise<PolicyEditorGrantRevokeOutcome>;
};

export interface PolicyEditorialRepository {
  run<T>(work: (tx: PolicyEditorialTx) => Promise<T>): Promise<T>;
  listEditorialItems(
    limit: number,
    offset: number
  ): Promise<EditorialItemRow[]>;
  listRevisionsForItems(itemIds: string[]): Promise<EditorialRevisionRow[]>;
  loadItemDetail(itemId: string): Promise<EditorialItemDetailRows | null>;
  listAuditEvents(itemId: string, limit: number): Promise<EditorialAuditRow[]>;
  listPolicyEditorGrants(): Promise<EditorialGrantRow[]>;
  findUserByEmail(email: string): Promise<EditorialActor | null>;
}

export type EditorialItemDetailRows = {
  item: EditorialItemRow;
  revisions: EditorialRevisionRow[];
  audit: EditorialAuditRow[];
  snapshot: {
    authority: string;
    officialTitle: string;
    canonicalUrl: string;
    sourceDate: string | null;
  } | null;
};

/** Deterministic content version of a human revision (draft concurrency + retries). */
/**
 * Phase 12 Stage 3 — stable identity for a directly published official source
 * snapshot. The fingerprint covers the snapshot identity and the source-first
 * content contract only, so the same snapshot always maps to the same
 * publication identity (the unique (snapshotId, analysisFingerprint) index
 * enforces it) regardless of who published it or how often the action repeats.
 */
export function officialSourceRevisionFingerprint(input: {
  itemId: string;
  snapshotId: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: POLICY_SOURCE_FIRST_SCHEMA,
        contentKind: "source_first",
        itemId: input.itemId,
        snapshotId: input.snapshotId,
      })
    )
    .digest("hex");
}

export function humanContentFingerprint(input: {
  content: PolicyHumanRevisionContent;
  createdByUserId: string;
  baseRevisionId: string | null;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: POLICY_HUMAN_REVISION_SCHEMA,
        content: policyHumanRevisionContentSchema.parse(input.content),
        createdByUserId: input.createdByUserId,
        baseRevisionId: input.baseRevisionId,
      })
    )
    .digest("hex");
}

/**
 * Deterministic slug derivation from the English title. Uniqueness is resolved
 * by the caller with a bounded numeric suffix; nothing random is used, so a
 * retried create resolves to the same slug instead of creating a duplicate.
 */
export function deriveManualPolicySlug(titleEn: string): string {
  const base = titleEn
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 96);
  const candidate = base.length >= 3 ? base : `policy-${base}`.slice(0, 96);
  if (!POLICY_SLUG_PATTERN.test(candidate)) {
    return "lawyer-policy-commentary";
  }
  return candidate;
}

export function resolveAvailableSlug(
  base: string,
  isTaken: (slug: string) => boolean
): string | null {
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`;
    if (POLICY_SLUG_PATTERN.test(slug) && !isTaken(slug)) {
      return slug;
    }
  }
  return null;
}

/**
 * Phase 12 Stage 3 R1/R2 — a bounded *change summary* for a draft edit.
 *
 * This answers "what changed?" for the audit trail: scalar fields carry
 * old/new values and narrative sections carry per-unit added/removed/modified
 * entries. Previews are explicitly truncated, so this is **not** the historical
 * document and must never be described as reconstructible history — the
 * complete, lossless per-save documents live in `PolicyIntelligenceDraftSnapshot`
 * (see `insertDraftSnapshot` / `planDraftSnapshotPrune`) and the audit row
 * links to the corresponding snapshot id.
 */
export type EditorialContentChangeSet = {
  changedFields: string[];
  scalarChanges: {
    field: string;
    before: string | null;
    after: string | null;
  }[];
  narrativeChanges: {
    section: string;
    addedIds: string[];
    removedIds: string[];
    modified: {
      id: string;
      before: string;
      after: string;
      /** Content digest of the full (untruncated) text, so a change is provable. */
      beforeDigest: string;
      afterDigest: string;
      beforeTruncated: boolean;
      afterTruncated: boolean;
    }[];
  }[];
  truncated: boolean;
};

const SCALAR_PREVIEW_LIMIT = 200;
const TEXT_PREVIEW_LIMIT = 160;

function preview(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  return value.length > SCALAR_PREVIEW_LIMIT
    ? `${value.slice(0, SCALAR_PREVIEW_LIMIT)}…`
    : value;
}

function narrativePreview(value: string): string {
  return value.length > TEXT_PREVIEW_LIMIT
    ? `${value.slice(0, TEXT_PREVIEW_LIMIT)}…`
    : value;
}

function localizedPair(value: { "zh-CN": string; en: string }): string {
  return `${value["zh-CN"]} \u241F ${value.en}`;
}

function digestOf(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function buildHumanContentChangeSet(
  before: PolicyHumanRevisionContent,
  after: PolicyHumanRevisionContent
): EditorialContentChangeSet {
  const scalarFields: {
    field: string;
    before: string | null;
    after: string | null;
  }[] = [
    {
      field: "attribution",
      before: before.attribution,
      after: after.attribution,
    },
    {
      field: "sourceStatus",
      before: before.sourceStatus,
      after: after.sourceStatus,
    },
    {
      field: "officialSourceDate",
      before: before.officialSourceDate,
      after: after.officialSourceDate,
    },
    {
      field: "commencementDate",
      before: before.commencementDate,
      after: after.commencementDate,
    },
    {
      field: "reviewedAsOfDate",
      before: before.reviewedAsOfDate,
      after: after.reviewedAsOfDate,
    },
    {
      field: "title",
      before: localizedPair(before.title),
      after: localizedPair(after.title),
    },
    {
      field: "overview",
      before: localizedPair(before.overview),
      after: localizedPair(after.overview),
    },
    {
      field: "body",
      before: before.body ? localizedPair(before.body) : null,
      after: after.body ? localizedPair(after.body) : null,
    },
    {
      field: "commentary",
      before: before.commentary ? localizedPair(before.commentary) : null,
      after: after.commentary ? localizedPair(after.commentary) : null,
    },
    {
      field: "sourceReferences",
      before: before.sourceReferences
        .map((reference) => reference.url)
        .join(" | "),
      after: after.sourceReferences
        .map((reference) => reference.url)
        .join(" | "),
    },
  ];
  const scalarChanges = scalarFields
    .filter((change) => change.before !== change.after)
    .map((change) => ({
      field: change.field,
      before: preview(change.before),
      after: preview(change.after),
    }));

  const sections: {
    section: string;
    before: readonly { id: string; text: { "zh-CN": string; en: string } }[];
    after: readonly { id: string; text: { "zh-CN": string; en: string } }[];
  }[] = [
    {
      section: "keyChanges",
      before: before.keyChanges,
      after: after.keyChanges,
    },
    {
      section: "affectedGroups",
      before: before.affectedGroups,
      after: after.affectedGroups,
    },
    {
      section: "implications",
      before: before.implications,
      after: after.implications,
    },
    {
      section: "recommendedActions",
      before: before.recommendedActions,
      after: after.recommendedActions,
    },
  ];
  const narrativeChanges: EditorialContentChangeSet["narrativeChanges"] = [];
  for (const section of sections) {
    const beforeById = new Map(
      section.before.map((unit) => [unit.id, unit.text] as const)
    );
    const afterById = new Map(
      section.after.map((unit) => [unit.id, unit.text] as const)
    );
    const addedIds: string[] = [];
    const removedIds: string[] = [];
    const modified: EditorialContentChangeSet["narrativeChanges"][number]["modified"] =
      [];
    for (const [id, text] of afterById) {
      const previous = beforeById.get(id);
      if (!previous) {
        addedIds.push(id);
        continue;
      }
      const beforePair = localizedPair(previous);
      const afterPair = localizedPair(text);
      if (beforePair !== afterPair) {
        modified.push({
          id,
          before: narrativePreview(beforePair),
          after: narrativePreview(afterPair),
          beforeDigest: digestOf(beforePair),
          afterDigest: digestOf(afterPair),
          beforeTruncated: beforePair.length > TEXT_PREVIEW_LIMIT,
          afterTruncated: afterPair.length > TEXT_PREVIEW_LIMIT,
        });
      }
    }
    for (const id of beforeById.keys()) {
      if (!afterById.has(id)) {
        removedIds.push(id);
      }
    }
    if (addedIds.length || removedIds.length || modified.length) {
      narrativeChanges.push({
        section: section.section,
        addedIds,
        removedIds,
        modified,
      });
    }
  }

  let changeSet: EditorialContentChangeSet = {
    changedFields: [
      ...scalarChanges.map((change) => change.field),
      ...narrativeChanges.map((change) => change.section),
    ],
    scalarChanges,
    narrativeChanges,
    truncated: false,
  };
  if (
    JSON.stringify(changeSet).length > EDITORIAL_AUDIT_DIFF_LIMIT_BYTES &&
    changeSet.narrativeChanges.length
  ) {
    changeSet = {
      ...changeSet,
      narrativeChanges: changeSet.narrativeChanges.map((section) => ({
        ...section,
        modified: section.modified.slice(0, 5),
      })),
      truncated: true,
    };
  }
  return changeSet;
}

/**
 * Phase 12 Stage 3 R1 — the single decision point for automatic publication.
 *
 * `human_protected` items were deliberately approved by an authorized Policy
 * Editor, so an eligible automated revision is captured and held for review
 * instead of silently replacing or unpublishing the approved revision. Nothing
 * else about the automated pipeline changes: discovery, acquisition, analysis
 * and verification proceed normally, and unprotected items keep publishing
 * automatically.
 */
export type AutomaticPublicationOutcome =
  | { outcome: "publish" }
  | { outcome: "hold"; reasonCode: "publication_gate_rejected" }
  | { outcome: "hold"; reasonCode: "human_publication_protected" }
  | { outcome: "suppress"; reasonCode: "item_archived" };

export function resolveAutomaticPublicationOutcome(input: {
  gateEligible: boolean;
  publicationMode: EditorialPublicationMode;
  itemArchived: boolean;
}): AutomaticPublicationOutcome {
  if (input.itemArchived) {
    return { outcome: "suppress", reasonCode: "item_archived" };
  }
  if (input.publicationMode === "human_protected") {
    return { outcome: "hold", reasonCode: "human_publication_protected" };
  }
  return input.gateEligible
    ? { outcome: "publish" }
    : { outcome: "hold", reasonCode: "publication_gate_rejected" };
}

/**
 * Phase 12 Stage 3 R2 — the item status a *newly held* automated revision may
 * write.
 *
 * A held AI analysis is pending review; on an editor-protected item that
 * already publishes a human-approved revision it must not rewrite the meaning
 * of that publication (which would make a deliberately approved item look like
 * an unreviewed one). The held revision itself still carries `review_required`,
 * so the pending-review signal and the public currentness warning stay honest.
 */
export function resolveHeldRevisionItemStatus(input: {
  currentStatus: EditorialItemStatus;
  publicationMode: EditorialPublicationMode;
  hasPublishedRevision: boolean;
}): EditorialItemStatus {
  if (
    input.publicationMode === "human_protected" &&
    input.hasPublishedRevision
  ) {
    return input.currentStatus;
  }
  return "review_required";
}

/** Canonical, byte-stable serialization of one saved draft document. */
export function serializeHumanContentSnapshot(
  content: PolicyHumanRevisionContent
): string {
  return JSON.stringify(policyHumanRevisionContentSchema.parse(content));
}

export function humanContentSnapshotMeta(content: PolicyHumanRevisionContent): {
  serialized: string;
  digest: string;
  bytes: number;
} {
  const serialized = serializeHumanContentSnapshot(content);
  return {
    serialized,
    digest: digestOf(serialized),
    bytes: Buffer.byteLength(serialized, "utf8"),
  };
}

/**
 * Bounded retention for a revision's draft recovery history.
 *
 * Keeps the newest snapshot unconditionally plus as many older ones as fit the
 * count/byte budget, and returns the ids of the oldest snapshots to delete.
 * Deterministic (save-number ordered) and never returns the newest snapshot.
 * This is a sliding recovery window: snapshots beyond the budget are genuinely
 * removed, so it must be described as bounded recovery, not full history.
 */
export function planDraftSnapshotPrune(
  snapshots: readonly {
    id: string;
    saveNumber: number;
    contentBytes: number;
  }[],
  options: {
    maxPerRevision?: number;
    maxBytesPerRevision?: number;
  } = {}
): string[] {
  const maxPerRevision =
    options.maxPerRevision ?? DRAFT_SNAPSHOT_MAX_PER_REVISION;
  const maxBytesPerRevision =
    options.maxBytesPerRevision ?? DRAFT_SNAPSHOT_MAX_BYTES_PER_REVISION;
  if (snapshots.length <= 1) {
    return [];
  }
  const ordered = [...snapshots].sort(
    (left, right) => left.saveNumber - right.saveNumber
  );
  const newest = ordered.at(-1);
  if (!newest) {
    return [];
  }
  const pruned: string[] = [];
  let keptCount = 1;
  let keptBytes = newest.contentBytes;
  let overBudget = false;
  for (let index = ordered.length - 2; index >= 0; index -= 1) {
    const snapshot = ordered[index];
    const wouldExceedCount = keptCount + 1 > maxPerRevision;
    const wouldExceedBytes =
      keptBytes + snapshot.contentBytes > maxBytesPerRevision;
    if (overBudget || wouldExceedCount || wouldExceedBytes) {
      overBudget = true;
      pruned.push(snapshot.id);
      continue;
    }
    keptCount += 1;
    keptBytes += snapshot.contentBytes;
  }
  return pruned.sort();
}
