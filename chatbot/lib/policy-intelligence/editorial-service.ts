import {
  declaredSourceStatusFromMetadata,
  deriveSourceFirstSourceStatus,
  evaluatePolicyPublicationDecision,
  POLICY_SOURCE_FIRST_SCHEMA,
  type PolicyAnalysis,
  type PolicyHumanRevisionContent,
  policyAnalysisSchema,
  policyHumanRevisionContentSchema,
  policyVerificationSchema,
} from "./contracts";
import {
  buildHumanContentChangeSet,
  DRAFT_SNAPSHOT_MAX_PER_REVISION,
  deriveManualPolicySlug,
  EDITORIAL_AUDIT_LIMIT,
  EDITORIAL_ITEM_DEFAULT_PAGE,
  EDITORIAL_ITEM_MAX_PAGE,
  type EditorialActor,
  type EditorialAuditRow,
  type EditorialContentKind,
  type EditorialDraftSnapshotRow,
  type EditorialError,
  type EditorialGrantRow,
  type EditorialItemRow,
  type EditorialItemStatus,
  type EditorialPublicationMode,
  type EditorialResult,
  type EditorialRevisionRow,
  type EditorialRevisionStatus,
  editorialError,
  humanContentFingerprint,
  humanContentSnapshotMeta,
  officialSourceRevisionFingerprint,
  type PolicyEditorGrantRevokeOutcome,
  type PolicyEditorialRepository,
  type PolicyEditorialTx,
  planDraftSnapshotPrune,
} from "./editorial-core";

/** Public-safe view of one revision for the editorial workspace. */
export type EditorialRevisionView = {
  id: string;
  revisionNumber: number;
  contentKind: EditorialContentKind;
  editorialStatus: EditorialRevisionStatus;
  /** Optimistic-concurrency version for draft updates. */
  contentVersion: string;
  overrideReason: string | null;
  baseRevisionId: string | null;
  createdByUserId: string | null;
  generatedAt: string | null;
  publishedAt: string | null;
  supersededAt: string | null;
  humanContent: PolicyHumanRevisionContent | null;
  aiDecision: AiDecisionSnapshot | null;
};

export type AiDecisionSnapshot = {
  gateEligible: boolean | null;
  gateReasons: string[];
  /**
   * Phase 12 Stage 3 D-072 — how the automated pipeline treated the base
   * revision: a full analysis publication, a source-first notice, or a
   * structural block. Advisory reasons never vetoed publication.
   */
  publicationMode: "full_analysis" | "source_first" | "blocked" | null;
  verificationVerdicts: { unitId: string; verdict: string }[];
  analysisSchemaVersion: string | null;
  recomputedAt: string;
  note: string | null;
};

/** Seed content for the override editor, derived from the AI revision. */
export type OverrideSeed = {
  title: { "zh-CN": string; en: string };
  overview: { "zh-CN": string; en: string };
  keyChanges: { id: string; text: { "zh-CN": string; en: string } }[];
  affectedGroups: { id: string; text: { "zh-CN": string; en: string } }[];
  implications: { id: string; text: { "zh-CN": string; en: string } }[];
  recommendedActions: { id: string; text: { "zh-CN": string; en: string } }[];
  sourceStatus: string;
  officialSource: {
    authority: string;
    title: string;
    url: string;
    date: string | null;
  } | null;
  sourceReferences: {
    authority: string;
    title: string;
    url: string;
    date: string | null;
    citation: string | null;
  }[];
};

/**
 * Phase 12 Stage 3 R1 — whether the override editor can prefill from stored AI
 * analysis. When the stored analysis is malformed/unavailable the lawyer must
 * still be able to correct the item, so the workspace opens a blank editor with
 * only official-source facts and this status explains why.
 */
export type OverrideSeedStatus =
  | "ready"
  | "analysis_unavailable"
  | "no_base_revision";

export type EditorialItemView = {
  id: string;
  slug: string;
  origin: "automated" | "manual";
  editorialStatus: EditorialItemStatus;
  sourceStatus: string;
  /** Durable human-publication protection state (R1). */
  publicationMode: EditorialPublicationMode;
  protectionSetAt: string | null;
  updatedAt: string | null;
  activePublishedRevision: EditorialRevisionView | null;
  heldAiRevision: EditorialRevisionView | null;
  draftRevisions: EditorialRevisionView[];
  latestRevisionNumber: number;
};

export type EditorialItemDetail = EditorialItemView & {
  revisions: EditorialRevisionView[];
  audit: EditorialAuditRow[];
  overrideSeed: OverrideSeed | null;
  overrideSeedStatus: OverrideSeedStatus;
};

/** One bounded page of the editorial workspace. */
export type EditorialWorkspacePage = {
  items: EditorialItemView[];
  page: {
    limit: number;
    offset: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
};

export type PolicyEditorialService = {
  /**
   * Whether the authenticated account holds *publication* authority (D-065):
   * a verified, explicitly granted lawyer account. An administrator without a
   * lawyer-role grant does not hold publication authority; administrators
   * manage grants and monitoring instead.
   */
  canEdit(actorUserId: string): Promise<boolean>;
  listWorkspacePaginated(input?: {
    limit?: number | null;
    offset?: number | null;
  }): Promise<EditorialWorkspacePage>;
  getItemDetail(itemId: string): Promise<EditorialItemDetail | null>;
  createManualDraft(input: {
    actorUserId: string;
    content: unknown;
    slug?: string | null;
    idempotencyKey?: string | null;
  }): Promise<
    EditorialResult<{
      itemId: string;
      revisionId: string;
      slug: string;
      revisionNumber: number;
      contentVersion: string;
    }>
  >;
  saveManualDraft(input: {
    actorUserId: string;
    itemId: string;
    revisionId: string;
    content: unknown;
    expectedContentVersion: string;
  }): Promise<EditorialResult<{ revisionId: string; contentVersion: string }>>;
  createManualRevision(input: {
    actorUserId: string;
    itemId: string;
  }): Promise<EditorialResult<{ revisionId: string; revisionNumber: number }>>;
  publishManualRevision(input: {
    actorUserId: string;
    itemId: string;
    revisionId: string;
    expectedContentVersion: string;
    idempotencyKey?: string | null;
  }): Promise<EditorialResult<{ revisionId: string; revisionNumber: number }>>;
  forcePublishOverride(input: {
    actorUserId: string;
    itemId: string;
    baseRevisionId: string;
    expectedBaseRevisionNumber: number;
    expectedPublishedRevisionId: string | null;
    content: unknown;
    overrideReason: string;
    idempotencyKey?: string | null;
  }): Promise<EditorialResult<{ revisionId: string; revisionNumber: number }>>;
  /**
   * Explicitly return a protected item to normal automatic publication. After
   * this transition the next eligible automated revision may publish normally.
   */
  releasePublicationProtection(input: {
    actorUserId: string;
    itemId: string;
    reason?: string | null;
  }): Promise<
    EditorialResult<{
      publicationMode: EditorialPublicationMode;
      changed: boolean;
    }>
  >;
  /**
   * Lossless, bounded history of human draft saves for one revision of an item.
   * Returns the complete stored documents (oldest first) for retrieval.
   */
  getDraftHistory(input: {
    actorUserId: string;
    itemId: string;
    revisionId: string;
  }): Promise<EditorialResult<{ snapshots: DraftSnapshotDetail[] }>>;
  archiveItem(input: {
    actorUserId: string;
    itemId: string;
    reason?: string | null;
  }): Promise<EditorialResult<{ editorialStatus: "archived" }>>;
  /**
   * Phase 12 Stage 3 — Publish Official Source.
   *
   * An authorized editor publishes the item's latest persisted official source
   * snapshot directly, without AI analysis, the analyzer, the verifier or the
   * publication gate. The stored revision is D-072's `source_first`
   * representation (official title/URL/excerpt come from the snapshot at read
   * time) and the item is `human_protected`, so later automatic syncs cannot
   * silently replace the editor-approved publication.
   */
  publishOfficialSource(input: {
    actorUserId: string;
    itemId: string;
  }): Promise<
    EditorialResult<{
      revisionId: string;
      revisionNumber: number;
      editorialStatus: "published";
      sourceStatus: string;
      snapshotId: string;
      /** True when this snapshot was already published (idempotent repeat). */
      unchanged: boolean;
    }>
  >;
  restoreItem(input: {
    actorUserId: string;
    itemId: string;
  }): Promise<EditorialResult<{ editorialStatus: EditorialItemStatus }>>;
  /**
   * R3 P0: activation (grant) is the only path that creates/reactivates a
   * grant; `reactivated` records whether an existing revoked grant was
   * explicitly re-enabled.
   */
  grantPolicyEditor(input: {
    actorUserId: string;
    email: string;
  }): Promise<EditorialResult<{ userId: string; reactivated: boolean }>>;
  /**
   * R3 P0: revocation is update-only and can never create a grant. The outcome
   * distinguishes a real revoke from the documented, audited no-ops.
   */
  revokePolicyEditor(input: {
    actorUserId: string;
    email: string;
  }): Promise<
    EditorialResult<{ userId: string; outcome: PolicyEditorGrantRevokeOutcome }>
  >;
  /**
   * Whether the authenticated account is an administrator (grant management
   * and monitoring). Deliberately separate from publication authority.
   */
  isAdministrator(actorUserId: string): Promise<boolean>;
  listPolicyEditorGrants(): Promise<EditorialGrantRow[]>;
  listAuditTrail(itemId: string): Promise<EditorialAuditRow[]>;
};

function iso(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseHumanContent(
  value: unknown
): EditorialResult<PolicyHumanRevisionContent> {
  const parsed = policyHumanRevisionContentSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return editorialError(
      "validation_failed",
      issue ? `${issue.path.join(".")}:${issue.message}` : undefined
    );
  }
  return { status: "ok", value: parsed.data };
}

export function projectRevisionView(
  row: EditorialRevisionRow
): EditorialRevisionView {
  const content = row.humanContent
    ? policyHumanRevisionContentSchema.safeParse(row.humanContent)
    : null;
  return {
    id: row.id,
    revisionNumber: row.revisionNumber,
    contentKind: row.contentKind,
    editorialStatus: row.editorialStatus,
    contentVersion: row.analysisFingerprint,
    overrideReason: row.overrideReason,
    baseRevisionId: row.baseRevisionId,
    createdByUserId: row.createdByUserId,
    generatedAt: iso(row.generatedAt),
    publishedAt: iso(row.publishedAt),
    supersededAt: iso(row.supersededAt),
    humanContent: content?.success ? content.data : null,
    aiDecision: (row.aiDecision as AiDecisionSnapshot | null) ?? null,
  };
}

/**
 * Recomputes what the automated gate/verifier concluded about an AI revision.
 * This is audit metadata for the human override record. It is strictly
 * best-effort: an unparseable stored revision or a missing snapshot records a
 * note, and the lawyer's publication still proceeds. The AI decision is
 * advisory, never a veto.
 */
export async function buildAiDecisionSnapshot(
  tx: PolicyEditorialTx,
  revision: EditorialRevisionRow
): Promise<AiDecisionSnapshot> {
  const notes: string[] = [];
  let gateEligible: boolean | null = null;
  let gateReasons: string[] = [];
  let publicationMode: AiDecisionSnapshot["publicationMode"] = null;
  let verificationVerdicts: { unitId: string; verdict: string }[] = [];
  let analysisSchemaVersion: string | null = null;
  try {
    const analysis = revision.analysis
      ? policyAnalysisSchema.parse(revision.analysis)
      : null;
    analysisSchemaVersion = analysis?.schemaVersion ?? null;
    const verification = revision.verification
      ? policyVerificationSchema.parse(revision.verification)
      : null;
    verificationVerdicts =
      verification?.assessments.map((assessment) => ({
        unitId: assessment.unitId,
        verdict: assessment.verdict,
      })) ?? [];
    if (analysis && verification && revision.snapshotId) {
      const evidence = await tx.getSnapshotEvidence(revision.snapshotId);
      if (evidence) {
        const decision = evaluatePolicyPublicationDecision({
          analysis,
          verification,
          evidence: [evidence],
        });
        // D-072: `gateEligible` now means "the pipeline would have published a
        // full AI analysis". Advisory signals are still recorded (and are shown
        // to the lawyer), but they never represented a veto.
        gateEligible = decision.mode === "full_analysis";
        gateReasons =
          decision.mode === "blocked"
            ? [...decision.blockers, ...decision.advisories]
            : decision.mode === "source_first"
              ? [
                  decision.sourceFirstReason ?? "analysis_unusable",
                  ...decision.advisories,
                ]
              : decision.advisories;
        publicationMode = decision.mode;
      } else {
        notes.push("snapshot_evidence_unavailable");
      }
    } else {
      notes.push("ai_revision_incomplete");
    }
  } catch {
    notes.push("ai_decision_recompute_failed");
  }
  return {
    gateEligible,
    gateReasons,
    publicationMode,
    verificationVerdicts,
    analysisSchemaVersion,
    recomputedAt: new Date().toISOString(),
    note: notes.length ? notes.join(",") : null,
  };
}

/**
 * Phase 12 Stage 3 R1 — blank-but-usable override seed when the stored AI
 * analysis cannot be read. The lawyer gets the official-source facts and an
 * empty bilingual form, so a failed/corrupted AI artifact can never make human
 * correction impossible. Nothing here infers legal content.
 */
export function overrideSeedFromFacts(
  evidence: {
    authority: string;
    officialTitle: string;
    canonicalUrl: string;
    sourceDate: string | null;
  } | null
): OverrideSeed {
  return {
    title: { "zh-CN": "", en: "" },
    overview: { "zh-CN": "", en: "" },
    keyChanges: [],
    affectedGroups: [],
    implications: [],
    recommendedActions: [],
    sourceStatus: "announced",
    officialSource: evidence
      ? {
          authority: evidence.authority,
          title: evidence.officialTitle,
          url: evidence.canonicalUrl,
          date: evidence.sourceDate,
        }
      : null,
    sourceReferences: evidence
      ? [
          {
            authority: evidence.authority,
            title: evidence.officialTitle,
            url: evidence.canonicalUrl,
            date: evidence.sourceDate,
            citation: null,
          },
        ]
      : [],
  };
}

/** Seed for the lawyer override editor, derived from the AI analysis revision. */
export function overrideSeedFromRevision(
  row: EditorialRevisionRow,
  evidence: {
    authority: string;
    officialTitle: string;
    canonicalUrl: string;
    sourceDate: string | null;
  } | null
): OverrideSeed | null {
  if (row.contentKind !== "ai_analysis" || !row.analysis) {
    return null;
  }
  let analysis: PolicyAnalysis;
  try {
    analysis = policyAnalysisSchema.parse(row.analysis);
  } catch {
    return null;
  }
  const unit = (item: {
    id: string;
    text: { "zh-CN": string; en: string };
  }) => ({
    id: item.id,
    text: { "zh-CN": item.text["zh-CN"], en: item.text.en },
  });
  return {
    title: {
      "zh-CN": analysis.title.text["zh-CN"],
      en: analysis.title.text.en,
    },
    overview: {
      "zh-CN": analysis.executiveSummary.text["zh-CN"],
      en: analysis.executiveSummary.text.en,
    },
    keyChanges: analysis.keyChanges.map(unit),
    affectedGroups: analysis.affectedGroups.map(unit),
    implications: analysis.practicalImpacts.map(unit),
    recommendedActions: analysis.recommendedActions.map(unit),
    sourceStatus: analysis.sourceStatus.value,
    officialSource: evidence
      ? {
          authority: evidence.authority,
          title: evidence.officialTitle,
          url: evidence.canonicalUrl,
          date: evidence.sourceDate,
        }
      : null,
    sourceReferences: evidence
      ? [
          {
            authority: evidence.authority,
            title: evidence.officialTitle,
            url: evidence.canonicalUrl,
            date: evidence.sourceDate,
            citation: null,
          },
        ]
      : [],
  };
}

export function projectItemView(
  item: EditorialItemRow,
  revisions: EditorialRevisionRow[]
): EditorialItemView {
  const sorted = [...revisions].sort(
    (left, right) =>
      new Date(right.generatedAt).getTime() -
      new Date(left.generatedAt).getTime()
  );
  const views = sorted.map(projectRevisionView);
  const active = item.latestPublishedRevisionId
    ? (views.find((view) => view.id === item.latestPublishedRevisionId) ?? null)
    : null;
  const heldAi = views.find(
    (view) =>
      view.contentKind === "ai_analysis" &&
      view.editorialStatus === "review_required"
  );
  return {
    id: item.id,
    slug: item.slug,
    origin: item.origin,
    editorialStatus: item.editorialStatus,
    sourceStatus: item.sourceStatus,
    publicationMode: item.publicationMode ?? "automatic",
    protectionSetAt: iso(item.protectionSetAt ?? null),
    updatedAt: iso(item.updatedAt),
    activePublishedRevision: active,
    heldAiRevision: heldAi ?? null,
    draftRevisions: views.filter((view) => view.editorialStatus === "draft"),
    latestRevisionNumber: views.reduce(
      (max, view) => Math.max(max, view.revisionNumber),
      0
    ),
  };
}

/**
 * Phase 12 Stage 3 R2 — append one lossless draft snapshot inside the caller's
 * transaction and apply the bounded retention prune.
 *
 * The prune only ever targets *this revision's* oldest snapshots, so a later
 * edit cannot destroy earlier recorded content beyond the documented budget,
 * and previously published revisions/items are never touched.
 */
async function appendDraftSnapshot(
  tx: PolicyEditorialTx,
  input: {
    itemId: string;
    revisionId: string;
    content: PolicyHumanRevisionContent;
    contentVersion: string;
    savedByUserId: string;
    now: Date;
  }
): Promise<{ snapshot: EditorialDraftSnapshotRow; prunedIds: string[] }> {
  const existing = await tx.listDraftSnapshots(
    input.revisionId,
    DRAFT_SNAPSHOT_MAX_PER_REVISION + 1
  );
  const saveNumber =
    existing.reduce((max, snapshot) => Math.max(max, snapshot.saveNumber), 0) +
    1;
  const meta = humanContentSnapshotMeta(input.content);
  const snapshot = await tx.insertDraftSnapshot({
    itemId: input.itemId,
    revisionId: input.revisionId,
    saveNumber,
    contentVersion: input.contentVersion,
    contentDigest: meta.digest,
    humanContent: input.content,
    contentBytes: meta.bytes,
    savedByUserId: input.savedByUserId,
    now: input.now,
  });
  const prunedIds = planDraftSnapshotPrune([
    ...existing.map((entry) => ({
      id: entry.id,
      saveNumber: entry.saveNumber,
      contentBytes: entry.contentBytes,
    })),
    {
      id: snapshot.id,
      saveNumber: snapshot.saveNumber,
      contentBytes: snapshot.contentBytes,
    },
  ]);
  if (prunedIds.length) {
    await tx.deleteDraftSnapshots(prunedIds);
  }
  return { snapshot, prunedIds };
}

/** Public-safe view of one retained draft snapshot (metadata only). */
export type DraftSnapshotView = {
  id: string;
  revisionId: string;
  saveNumber: number;
  contentVersion: string;
  contentDigest: string;
  contentBytes: number;
  savedByUserId: string;
  savedAt: string | null;
};

/** One retained snapshot including its complete document. */
export type DraftSnapshotDetail = DraftSnapshotView & {
  /** Complete stored document; null only when a stored row is unreadable. */
  humanContent: PolicyHumanRevisionContent | null;
  contentValid: boolean;
};

/**
 * D-070 policy editorial authority (supersedes the D-065/R1 role restriction).
 *
 * The owner has clarified that the Admin account is the firm's *principal
 * lawyer*, so a verified Admin holds complete Policy Intelligence editorial
 * authority **inherently**: no PolicyEditorGrant is required, and ordinary
 * grant revocation can never take that authority away. Every other account
 * gains the same capability only as a verified lawyer holding a currently
 * active grant — so a lawyer without a grant, an ordinary user, an unverified
 * identity, or a forged/improperly assigned grant can never publish.
 *
 * Role and verification status are always read from the database actor record,
 * never from session claims or request bodies, and D-065 stands: human legal
 * editorial decisions take precedence over AI judgments.
 */
async function requirePublicationAuthority(
  tx: PolicyEditorialTx,
  actorUserId: string
): Promise<EditorialActor | EditorialError> {
  const actor = await tx.getActor(actorUserId);
  if (!actor) {
    return editorialError("unauthenticated");
  }
  if (!actor.emailVerifiedAt) {
    return editorialError("identity_not_verified");
  }
  if (actor.role === "admin") {
    // Principal lawyer: inherent authority, independent of any grant.
    return actor;
  }
  if (actor.role !== "lawyer") {
    return editorialError("publication_authority_required");
  }
  if (!(await tx.isActivePolicyEditor(actorUserId))) {
    return editorialError("capability_required");
  }
  return actor;
}

/** Server-derived editor identity snapshot for durable audit rows. */
function auditEditorIdentity(actor: EditorialActor): Record<string, unknown> {
  return {
    editorUserId: actor.userId,
    editorEmail: actor.email,
    editorRole: actor.role,
  };
}

export function isEditorialError(value: unknown): value is EditorialError {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { status?: unknown }).status === "error"
  );
}

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,119}$/u.test(slug);
}

export function createPolicyEditorialService(
  repository: PolicyEditorialRepository
): PolicyEditorialService {
  return {
    async canEdit(actorUserId) {
      return await repository.run(async (tx) => {
        const actor = await tx.getActor(actorUserId);
        if (!actor || !actor.emailVerifiedAt) {
          return false;
        }
        // D-070: a verified Admin (principal lawyer) always may edit policies.
        if (actor.role === "admin") {
          return true;
        }
        if (actor.role !== "lawyer") {
          return false;
        }
        return await tx.isActivePolicyEditor(actorUserId);
      });
    },

    async listWorkspacePaginated(input) {
      const limit = Math.min(
        EDITORIAL_ITEM_MAX_PAGE,
        Math.max(1, input?.limit ?? EDITORIAL_ITEM_DEFAULT_PAGE)
      );
      const offset = Math.max(0, input?.offset ?? 0);
      // One extra row distinguishes "has more" from "exactly at the end".
      const items = await repository.listEditorialItems(limit + 1, offset);
      const hasMore = items.length > limit;
      const visible = hasMore ? items.slice(0, limit) : items;
      const revisions = visible.length
        ? await repository.listRevisionsForItems(visible.map((item) => item.id))
        : [];
      const byItem = new Map<string, EditorialRevisionRow[]>();
      for (const revision of revisions) {
        const bucket = byItem.get(revision.itemId) ?? [];
        bucket.push(revision);
        byItem.set(revision.itemId, bucket);
      }
      return {
        items: visible
          .map((item) => projectItemView(item, byItem.get(item.id) ?? []))
          .sort((left, right) =>
            (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "")
          ),
        page: {
          limit,
          offset,
          hasMore,
          nextOffset: hasMore ? offset + visible.length : null,
        },
      };
    },

    async getItemDetail(itemId) {
      const rows = await repository.loadItemDetail(itemId);
      if (!rows) {
        return null;
      }
      const base = projectItemView(rows.item, rows.revisions);
      const seedSourceId =
        base.heldAiRevision?.id ?? base.activePublishedRevision?.id ?? null;
      const seedRevision = seedSourceId
        ? (rows.revisions.find((revision) => revision.id === seedSourceId) ??
          null)
        : null;
      const seed = seedRevision
        ? overrideSeedFromRevision(seedRevision, rows.snapshot)
        : null;
      const overrideSeedStatus: OverrideSeedStatus = seedRevision
        ? seed
          ? "ready"
          : "analysis_unavailable"
        : "no_base_revision";
      return {
        ...base,
        revisions: rows.revisions.map(projectRevisionView),
        audit: rows.audit,
        overrideSeed:
          seed ??
          (seedRevision?.contentKind === "ai_analysis"
            ? overrideSeedFromFacts(rows.snapshot)
            : null),
        overrideSeedStatus,
      };
    },

    async createManualDraft(input) {
      const content = parseHumanContent(input.content);
      if (isEditorialError(content)) {
        return content;
      }
      return await repository.run(async (tx) => {
        const capability = await requirePublicationAuthority(
          tx,
          input.actorUserId
        );
        if (isEditorialError(capability)) {
          return capability;
        }
        const requestedSlug = input.slug?.trim() ?? "";
        if (requestedSlug && !isValidSlug(requestedSlug)) {
          return editorialError("validation_failed", "slug");
        }
        const fingerprint = humanContentFingerprint({
          content: content.value,
          createdByUserId: capability.userId,
          baseRevisionId: null,
        });
        const baseSlug =
          requestedSlug || deriveManualPolicySlug(content.value.title.en);
        const requestedKey = input.idempotencyKey?.trim() || null;
        /**
         * Resolve an idempotent replay: a retried create is recognised either by
         * the recorded create key (so a retry after the draft was edited still
         * resolves to the same item) or by identical first-revision content when
         * no key was supplied. Returns null for a genuine different request.
         */
        const resolveReplay = async (existing: EditorialItemRow) => {
          const revisions = await tx.listRevisions(existing.id);
          const first = revisions.find(
            (revision) => revision.revisionNumber === 1
          );
          const sameAuthorItem =
            existing.origin === "manual" &&
            existing.createdByUserId === capability.userId &&
            first?.contentKind === "lawyer_authored";
          if (!sameAuthorItem || !first) {
            return null;
          }
          const replayedByKey =
            requestedKey !== null &&
            revisions.some(
              (revision) => revision.idempotencyKey === requestedKey
            );
          const replayedByContent = first.analysisFingerprint === fingerprint;
          if (!replayedByKey && !replayedByContent) {
            return null;
          }
          return {
            status: "ok" as const,
            value: {
              itemId: existing.id,
              revisionId: first.id,
              slug: existing.slug,
              revisionNumber: first.revisionNumber,
              contentVersion: first.analysisFingerprint,
            },
          };
        };
        let created: EditorialItemRow | null = null;
        for (let attempt = 1; attempt <= 50; attempt += 1) {
          const candidate = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
          if (!isValidSlug(candidate)) {
            continue;
          }
          const existing = await tx.findItemBySlug(candidate);
          if (existing) {
            const replay = await resolveReplay(existing);
            if (replay) {
              return replay;
            }
            continue;
          }
          // Two concurrent creates may race for the same slug. The insert is a
          // conflict-free `ON CONFLICT DO NOTHING`, so a lost race resolves to
          // `slug_taken` here — never an uncaught database error — and is then
          // either an idempotent replay or a controlled conflict.
          const inserted = await tx.insertItemIfSlugAvailable({
            slug: candidate,
            origin: "manual",
            editorialStatus: "draft",
            sourceStatus: content.value.sourceStatus,
            createdByUserId: capability.userId,
          });
          if (inserted.status === "created") {
            created = inserted.item;
            break;
          }
          const raced = await tx.findItemBySlug(candidate);
          if (raced) {
            const replay = await resolveReplay(raced);
            if (replay) {
              return replay;
            }
          }
        }
        if (!created) {
          return editorialError("slug_unavailable");
        }
        const now = new Date();
        const item = created;
        const revision = await tx.insertRevision({
          itemId: item.id,
          snapshotId: null,
          contentKind: "lawyer_authored",
          analysisFingerprint: fingerprint,
          revisionNumber: 1,
          editorialStatus: "draft",
          humanContent: content.value,
          aiDecision: null,
          overrideReason: null,
          idempotencyKey: requestedKey,
          baseRevisionId: null,
          createdByUserId: capability.userId,
          generatedAt: now.toISOString(),
          publishedAt: null,
        });
        // The first saved document is part of the lossless draft history.
        const { snapshot } = await appendDraftSnapshot(tx, {
          itemId: item.id,
          revisionId: revision.id,
          content: content.value,
          contentVersion: fingerprint,
          savedByUserId: capability.userId,
          now,
        });
        await tx.appendAuditEvent({
          actorUserId: capability.userId,
          action: "create_manual_policy",
          itemId: item.id,
          revisionId: revision.id,
          overrideReason: null,
          detail: {
            slug: item.slug,
            contentVersion: fingerprint,
            sourceStatus: content.value.sourceStatus,
            sourceReferenceCount: content.value.sourceReferences.length,
            officialSourceDate: content.value.officialSourceDate,
            commencementDate: content.value.commencementDate,
            reviewedAsOfDate: content.value.reviewedAsOfDate,
            snapshotId: snapshot.id,
            snapshotSaveNumber: snapshot.saveNumber,
            ...auditEditorIdentity(capability),
          },
        });
        return {
          status: "ok" as const,
          value: {
            itemId: item.id,
            revisionId: revision.id,
            slug: item.slug,
            revisionNumber: revision.revisionNumber,
            contentVersion: fingerprint,
          },
        };
      });
    },

    async saveManualDraft(input) {
      const content = parseHumanContent(input.content);
      if (isEditorialError(content)) {
        return content;
      }
      return await repository.run(async (tx) => {
        const capability = await requirePublicationAuthority(
          tx,
          input.actorUserId
        );
        if (isEditorialError(capability)) {
          return capability;
        }
        const item = await tx.getItemForUpdate(input.itemId);
        if (!item) {
          return editorialError("item_not_found");
        }
        if (item.editorialStatus === "archived") {
          return editorialError("item_archived");
        }
        const revision = await tx.getRevisionForUpdate(input.revisionId);
        if (!revision || revision.itemId !== item.id) {
          return editorialError("revision_not_found");
        }
        if (revision.contentKind === "ai_analysis") {
          return editorialError("not_a_draft");
        }
        if (revision.editorialStatus !== "draft") {
          return editorialError("not_a_draft");
        }
        if (revision.analysisFingerprint !== input.expectedContentVersion) {
          return editorialError("stale_draft_conflict");
        }
        const fingerprint = humanContentFingerprint({
          content: content.value,
          createdByUserId: revision.createdByUserId ?? capability.userId,
          baseRevisionId: revision.baseRevisionId,
        });
        // Change *summary* for the audit trail (bounded, previews truncated).
        const previousContent = revision.humanContent
          ? policyHumanRevisionContentSchema.safeParse(revision.humanContent)
          : null;
        const changeSet =
          previousContent?.success === true
            ? buildHumanContentChangeSet(previousContent.data, content.value)
            : {
                changedFields: ["content"],
                scalarChanges: [],
                narrativeChanges: [],
                truncated: false,
                previousContentUnavailable: true,
              };
        await tx.updateRevision(revision.id, {
          humanContent: content.value,
          analysisFingerprint: fingerprint,
        });
        // Lossless history: the previous complete document is already a durable
        // snapshot, and this save appends the new complete document. A later
        // edit can therefore never destroy earlier recorded content.
        const { snapshot, prunedIds } = await appendDraftSnapshot(tx, {
          itemId: item.id,
          revisionId: revision.id,
          content: content.value,
          contentVersion: fingerprint,
          savedByUserId: capability.userId,
          now: new Date(),
        });
        await tx.appendAuditEvent({
          actorUserId: capability.userId,
          action: "save_manual_draft",
          itemId: item.id,
          revisionId: revision.id,
          overrideReason: null,
          detail: {
            contentVersion: fingerprint,
            previousContentVersion: revision.analysisFingerprint,
            changeSet,
            snapshotId: snapshot.id,
            snapshotSaveNumber: snapshot.saveNumber,
            prunedSnapshotCount: prunedIds.length,
            ...auditEditorIdentity(capability),
          },
        });
        return {
          status: "ok" as const,
          value: { revisionId: revision.id, contentVersion: fingerprint },
        };
      });
    },

    async createManualRevision(input) {
      return await repository.run(async (tx) => {
        const capability = await requirePublicationAuthority(
          tx,
          input.actorUserId
        );
        if (isEditorialError(capability)) {
          return capability;
        }
        const item = await tx.getItemForUpdate(input.itemId);
        if (!item) {
          return editorialError("item_not_found");
        }
        if (item.editorialStatus === "archived") {
          return editorialError("item_archived");
        }
        if (item.origin !== "manual") {
          return editorialError("not_manual_origin");
        }
        const revisions = await tx.listRevisions(item.id);
        const published = item.latestPublishedRevisionId
          ? (revisions.find(
              (revision) => revision.id === item.latestPublishedRevisionId
            ) ?? null)
          : null;
        if (!published || published.contentKind !== "lawyer_authored") {
          return editorialError("validation_failed", "no_published_revision");
        }
        const parsed = policyHumanRevisionContentSchema.safeParse(
          published.humanContent
        );
        if (!parsed.success) {
          return editorialError("validation_failed", "published_content");
        }
        const now = new Date();
        const revisionNumber = (await tx.maxRevisionNumber(item.id)) + 1;
        const fingerprint = humanContentFingerprint({
          content: parsed.data,
          createdByUserId: capability.userId,
          baseRevisionId: published.id,
        });
        const revision = await tx.insertRevision({
          itemId: item.id,
          snapshotId: null,
          contentKind: "lawyer_authored",
          analysisFingerprint: fingerprint,
          revisionNumber,
          editorialStatus: "draft",
          humanContent: parsed.data,
          aiDecision: null,
          overrideReason: null,
          idempotencyKey: null,
          // Phase 12 Stage 3 R2: the draft records the published revision it was
          // based on, so publishing can detect that another lawyer published a
          // newer revision in the meantime.
          baseRevisionId: published.id,
          createdByUserId: capability.userId,
          generatedAt: now.toISOString(),
          publishedAt: null,
        });
        const { snapshot } = await appendDraftSnapshot(tx, {
          itemId: item.id,
          revisionId: revision.id,
          content: parsed.data,
          contentVersion: fingerprint,
          savedByUserId: capability.userId,
          now,
        });
        await tx.appendAuditEvent({
          actorUserId: capability.userId,
          action: "create_revision_draft",
          itemId: item.id,
          revisionId: revision.id,
          overrideReason: null,
          detail: {
            fromRevisionId: published.id,
            revisionNumber,
            baseRevisionId: published.id,
            snapshotId: snapshot.id,
            snapshotSaveNumber: snapshot.saveNumber,
          },
        });
        return {
          status: "ok" as const,
          value: { revisionId: revision.id, revisionNumber },
        };
      });
    },

    async publishManualRevision(input) {
      return await repository.run(async (tx) => {
        const capability = await requirePublicationAuthority(
          tx,
          input.actorUserId
        );
        if (isEditorialError(capability)) {
          return capability;
        }
        const item = await tx.getItemForUpdate(input.itemId);
        if (!item) {
          return editorialError("item_not_found");
        }
        if (item.editorialStatus === "archived") {
          return editorialError("item_archived");
        }
        if (item.origin !== "manual") {
          return editorialError("not_manual_origin");
        }
        const revision = await tx.getRevisionForUpdate(input.revisionId);
        if (!revision || revision.itemId !== item.id) {
          return editorialError("revision_not_found");
        }
        const key = input.idempotencyKey?.trim() || null;
        if (revision.editorialStatus === "published") {
          // A retried publish resolves to the already-published revision
          // instead of creating a second publication event.
          if (
            key &&
            revision.idempotencyKey &&
            key !== revision.idempotencyKey
          ) {
            return editorialError("idempotency_key_reused");
          }
          return {
            status: "ok" as const,
            value: {
              revisionId: revision.id,
              revisionNumber: revision.revisionNumber,
            },
          };
        }
        if (revision.contentKind !== "lawyer_authored") {
          return editorialError("not_a_draft");
        }
        if (revision.editorialStatus !== "draft") {
          return editorialError("not_a_draft");
        }
        if (revision.analysisFingerprint !== input.expectedContentVersion) {
          return editorialError("stale_draft_conflict");
        }
        // Phase 12 Stage 3 R2 concurrent-publication guard: the draft records the
        // published revision it was based on, and the item row is locked above,
        // so a draft whose baseline is no longer the current publication is
        // rejected instead of silently superseding a newer lawyer's revision.
        // The initial unpublished draft has a null baseline, which still matches
        // an item that has never published anything.
        if (
          (revision.baseRevisionId ?? null) !==
          (item.latestPublishedRevisionId ?? null)
        ) {
          return editorialError(
            "stale_publication_conflict",
            "draft_baseline_superseded"
          );
        }
        if (key) {
          const existing = await tx.findRevisionByIdempotencyKey(item.id, key);
          if (existing && existing.id !== revision.id) {
            return editorialError("idempotency_key_reused");
          }
        }
        const parsed = policyHumanRevisionContentSchema.safeParse(
          revision.humanContent
        );
        if (!parsed.success) {
          return editorialError("validation_failed", "draft_content");
        }
        const now = new Date();
        const previousPublishedRevisionId = item.latestPublishedRevisionId;
        if (
          previousPublishedRevisionId &&
          previousPublishedRevisionId !== revision.id
        ) {
          await tx.updateRevision(previousPublishedRevisionId, {
            editorialStatus: "superseded",
            supersededAt: now,
          });
        }
        await tx.updateRevision(revision.id, {
          editorialStatus: "published",
          publishedAt: now,
          idempotencyKey: key,
        });
        await tx.updateItem(item.id, {
          editorialStatus: "published",
          sourceStatus: parsed.data.sourceStatus,
          latestPublishedRevisionId: revision.id,
          publicationMode: "human_protected",
          protectionSetAt: now,
          protectionSetByUserId: capability.userId,
          updatedAt: now,
        });
        await tx.appendAuditEvent({
          actorUserId: capability.userId,
          action: "publish_manual_policy",
          itemId: item.id,
          revisionId: revision.id,
          overrideReason: null,
          detail: {
            revisionNumber: revision.revisionNumber,
            previousPublishedRevisionId,
            sourceStatus: parsed.data.sourceStatus,
            officialSourceDate: parsed.data.officialSourceDate,
            commencementDate: parsed.data.commencementDate,
            reviewedAsOfDate: parsed.data.reviewedAsOfDate,
            publicationModeBefore: item.publicationMode,
            publicationModeAfter: "human_protected",
            ...auditEditorIdentity(capability),
          },
        });
        return {
          status: "ok" as const,
          value: {
            revisionId: revision.id,
            revisionNumber: revision.revisionNumber,
          },
        };
      });
    },

    /**
     * Lawyer force publish: the authorized Policy Editor corrects an AI-held or
     * AI-published revision and publishes it, with no AI re-run, no verifier
     * call, no relevance score requirement and no publication-gate PASS. The
     * AI's earlier decision is preserved in the durable audit record.
     */
    async forcePublishOverride(input) {
      const content = parseHumanContent(input.content);
      if (isEditorialError(content)) {
        return content;
      }
      const overrideReason = input.overrideReason.trim();
      if (overrideReason.length < 3 || overrideReason.length > 2000) {
        return editorialError("validation_failed", "override_reason");
      }
      return await repository.run(async (tx) => {
        const capability = await requirePublicationAuthority(
          tx,
          input.actorUserId
        );
        if (isEditorialError(capability)) {
          return capability;
        }
        const item = await tx.getItemForUpdate(input.itemId);
        if (!item) {
          return editorialError("item_not_found");
        }
        if (item.editorialStatus === "archived") {
          return editorialError("item_archived");
        }
        const base = await tx.getRevisionForUpdate(input.baseRevisionId);
        if (!base || base.itemId !== item.id) {
          return editorialError("revision_not_found");
        }
        if (base.contentKind !== "ai_analysis") {
          return editorialError("revision_not_overridable");
        }
        // Idempotency is resolved before the staleness guards: a retry of an
        // already-successful force publish must resolve to the same revision
        // (its own earlier write necessarily changed the publication pointer).
        const key = input.idempotencyKey?.trim() || null;
        const fingerprint = humanContentFingerprint({
          content: content.value,
          createdByUserId: capability.userId,
          baseRevisionId: base.id,
        });
        if (key) {
          const existing = await tx.findRevisionByIdempotencyKey(item.id, key);
          if (existing) {
            if (
              existing.analysisFingerprint === fingerprint &&
              existing.baseRevisionId === base.id
            ) {
              return {
                status: "ok" as const,
                value: {
                  revisionId: existing.id,
                  revisionNumber: existing.revisionNumber,
                },
              };
            }
            return editorialError("idempotency_key_reused");
          }
        }
        if (base.revisionNumber !== input.expectedBaseRevisionNumber) {
          return editorialError("stale_base_revision_conflict");
        }
        if (
          (item.latestPublishedRevisionId ?? null) !==
          input.expectedPublishedRevisionId
        ) {
          return editorialError("stale_publication_conflict");
        }
        if (base.editorialStatus === "superseded") {
          return editorialError("stale_base_revision_conflict");
        }
        const aiDecision = await buildAiDecisionSnapshot(tx, base);
        const now = new Date();
        const revisionNumber = (await tx.maxRevisionNumber(item.id)) + 1;
        const revision = await tx.insertRevision({
          itemId: item.id,
          snapshotId: base.snapshotId,
          contentKind: "lawyer_override",
          analysisFingerprint: fingerprint,
          revisionNumber,
          editorialStatus: "published",
          humanContent: content.value,
          aiDecision,
          overrideReason,
          idempotencyKey: key,
          baseRevisionId: base.id,
          createdByUserId: capability.userId,
          generatedAt: now.toISOString(),
          publishedAt: now.toISOString(),
        });
        const previousPublishedRevisionId = item.latestPublishedRevisionId;
        if (
          previousPublishedRevisionId &&
          previousPublishedRevisionId !== revision.id
        ) {
          await tx.updateRevision(previousPublishedRevisionId, {
            editorialStatus: "superseded",
            supersededAt: now,
          });
        }
        if (base.id !== previousPublishedRevisionId) {
          await tx.updateRevision(base.id, {
            editorialStatus: "superseded",
            supersededAt: now,
          });
        }
        await tx.updateItem(item.id, {
          editorialStatus: "published",
          sourceStatus: content.value.sourceStatus,
          latestPublishedRevisionId: revision.id,
          publicationMode: "human_protected",
          protectionSetAt: now,
          protectionSetByUserId: capability.userId,
          updatedAt: now,
        });
        await tx.appendAuditEvent({
          actorUserId: capability.userId,
          action: "force_publish_revision",
          itemId: item.id,
          revisionId: revision.id,
          overrideReason,
          detail: {
            baseRevisionId: base.id,
            baseRevisionNumber: base.revisionNumber,
            previousPublishedRevisionId,
            sourceStatus: content.value.sourceStatus,
            officialSourceDate: content.value.officialSourceDate,
            commencementDate: content.value.commencementDate,
            reviewedAsOfDate: content.value.reviewedAsOfDate,
            publicationModeBefore: item.publicationMode,
            publicationModeAfter: "human_protected",
            aiDecision,
            ...auditEditorIdentity(capability),
          },
        });
        return {
          status: "ok" as const,
          value: { revisionId: revision.id, revisionNumber },
        };
      });
    },

    async archiveItem(input) {
      return await repository.run(async (tx) => {
        const capability = await requirePublicationAuthority(
          tx,
          input.actorUserId
        );
        if (isEditorialError(capability)) {
          return capability;
        }
        const item = await tx.getItemForUpdate(input.itemId);
        if (!item) {
          return editorialError("item_not_found");
        }
        if (item.editorialStatus === "archived") {
          return {
            status: "ok" as const,
            value: { editorialStatus: "archived" as const },
          };
        }
        const now = new Date();
        await tx.updateItem(item.id, {
          editorialStatus: "archived",
          updatedAt: now,
        });
        await tx.appendAuditEvent({
          actorUserId: capability.userId,
          action: "archive_policy_item",
          itemId: item.id,
          revisionId: null,
          overrideReason: null,
          detail: {
            previousStatus: item.editorialStatus,
            reason: input.reason?.trim().slice(0, 500) || null,
            publicationMode: item.publicationMode,
            ...auditEditorIdentity(capability),
          },
        });
        return {
          status: "ok" as const,
          value: { editorialStatus: "archived" as const },
        };
      });
    },

    async publishOfficialSource(input) {
      return await repository.run(async (tx) => {
        const capability = await requirePublicationAuthority(
          tx,
          input.actorUserId
        );
        if (isEditorialError(capability)) {
          return capability;
        }
        // The item row is locked for the whole publication, exactly like the
        // automated pipeline's revision write. A concurrent sync therefore
        // serialises against this transaction instead of interleaving with it.
        const item = await tx.getItemForUpdate(input.itemId);
        if (!item) {
          return editorialError("item_not_found");
        }
        if (item.editorialStatus === "archived") {
          // Archiving is a deliberate human decision: publishing the source
          // must never silently resurrect an archived policy.
          return editorialError("item_archived");
        }
        const snapshot = await tx.getSourceSnapshotForItem({
          itemId: item.id,
          snapshotId: item.latestSnapshotId,
        });
        if (!snapshot) {
          // Only a persisted official snapshot is publishable: without one
          // there is no authentic source identity to show.
          return editorialError("validation_failed", "no_source_snapshot");
        }
        const fingerprint = officialSourceRevisionFingerprint({
          itemId: item.id,
          snapshotId: snapshot.id,
        });
        const revisions = await tx.listRevisions(item.id);
        const existing = revisions.find(
          (revision) => revision.analysisFingerprint === fingerprint
        );
        if (existing) {
          if (item.latestPublishedRevisionId === existing.id) {
            // Repeated click for the same effective publication: no new
            // revision and no duplicate audit event.
            return {
              status: "ok" as const,
              value: {
                revisionId: existing.id,
                revisionNumber: existing.revisionNumber,
                editorialStatus: "published" as const,
                sourceStatus: item.sourceStatus,
                snapshotId: snapshot.id,
                unchanged: true,
              },
            };
          }
          return editorialError("stale_publication_conflict");
        }
        /**
         * Honest status only: an explicit, allowlisted declared status is
         * respected; otherwise the publication is `unknown` and never implies
         * that the instrument is already in force.
         */
        const sourceStatus = deriveSourceFirstSourceStatus({
          declaredSourceStatus: declaredSourceStatusFromMetadata(
            snapshot.sourceMetadata
          ),
        });
        const now = new Date();
        const previousPublished =
          item.latestPublishedRevisionId === null
            ? null
            : (revisions.find(
                (revision) => revision.id === item.latestPublishedRevisionId
              ) ?? null);
        if (previousPublished?.editorialStatus === "published") {
          await tx.updateRevision(previousPublished.id, {
            editorialStatus: "superseded",
            supersededAt: now,
          });
        }
        const revision = await tx.insertRevision({
          itemId: item.id,
          snapshotId: snapshot.id,
          contentKind: "source_first",
          schemaVersion: POLICY_SOURCE_FIRST_SCHEMA,
          analysisFingerprint: fingerprint,
          revisionNumber: (await tx.maxRevisionNumber(item.id)) + 1,
          editorialStatus: "published",
          humanContent: null,
          aiDecision: null,
          overrideReason: null,
          idempotencyKey: null,
          baseRevisionId: null,
          createdByUserId: capability.userId,
          generatedAt: now.toISOString(),
          publishedAt: now.toISOString(),
          // No model ran: the metadata records why this official source was
          // published directly and carries no analysis or verification.
          modelMetadata: {
            sourceFirst: { reason: "lawyer_source_publication" },
            advisories: [],
            publishedBy: {
              actorUserId: capability.userId,
              initiatedBy: "editorial",
            },
          },
        });
        await tx.updateItem(item.id, {
          editorialStatus: "published",
          sourceStatus,
          latestPublishedRevisionId: revision.id,
          // D-070/D-065: the editor-approved publication is protected from
          // silent replacement by later automated revisions.
          publicationMode: "human_protected",
          protectionSetAt: now,
          protectionSetByUserId: capability.userId,
          updatedAt: now,
        });
        await tx.appendAuditEvent({
          actorUserId: capability.userId,
          action: "publish_official_source",
          itemId: item.id,
          revisionId: revision.id,
          overrideReason: null,
          detail: {
            snapshotId: snapshot.id,
            contentKind: "source_first",
            schemaVersion: POLICY_SOURCE_FIRST_SCHEMA,
            sourceFirstReason: "lawyer_source_publication",
            sourceStatus,
            previousStatus: item.editorialStatus,
            previousPublishedRevisionId: item.latestPublishedRevisionId,
            publicationModeBefore: item.publicationMode,
            publicationModeAfter: "human_protected",
            ...auditEditorIdentity(capability),
          },
        });
        return {
          status: "ok" as const,
          value: {
            revisionId: revision.id,
            revisionNumber: revision.revisionNumber,
            editorialStatus: "published" as const,
            sourceStatus,
            snapshotId: snapshot.id,
            unchanged: false,
          },
        };
      });
    },

    async restoreItem(input) {
      return await repository.run(async (tx) => {
        const capability = await requirePublicationAuthority(
          tx,
          input.actorUserId
        );
        if (isEditorialError(capability)) {
          return capability;
        }
        const item = await tx.getItemForUpdate(input.itemId);
        if (!item) {
          return editorialError("item_not_found");
        }
        if (item.editorialStatus !== "archived") {
          return editorialError("item_not_archived");
        }
        const revisions = await tx.listRevisions(item.id);
        const published = item.latestPublishedRevisionId
          ? (revisions.find(
              (revision) => revision.id === item.latestPublishedRevisionId
            ) ?? null)
          : null;
        // Restore recomputes the honest status from the actual stored history:
        // an intact published revision returns to `published`; drafts return to
        // `draft`; nothing is silently published or unpublished.
        const restoredStatus: EditorialItemStatus =
          published?.editorialStatus === "published"
            ? "published"
            : revisions.some((revision) => revision.editorialStatus === "draft")
              ? "draft"
              : "review_required";
        const now = new Date();
        await tx.updateItem(item.id, {
          editorialStatus: restoredStatus,
          updatedAt: now,
        });
        await tx.appendAuditEvent({
          actorUserId: capability.userId,
          action: "restore_policy_item",
          itemId: item.id,
          revisionId: published?.id ?? null,
          overrideReason: null,
          // Restore never changes the publication-protection decision: an
          // editor-protected item stays protected after a restore.
          detail: {
            restoredStatus,
            publicationMode: item.publicationMode,
            ...auditEditorIdentity(capability),
          },
        });
        return {
          status: "ok" as const,
          value: { editorialStatus: restoredStatus },
        };
      });
    },

    /**
     * Phase 12 Stage 3 R1 — explicit editorial release of publication
     * protection. Once released, the item returns to normal automatic
     * publication; the next eligible automated revision may publish without
     * further human approval. Already-held revisions are not retroactively
     * published by this transition.
     */
    async releasePublicationProtection(input) {
      const reason = input.reason?.trim().slice(0, 500) || null;
      return await repository.run(async (tx) => {
        const capability = await requirePublicationAuthority(
          tx,
          input.actorUserId
        );
        if (isEditorialError(capability)) {
          return capability;
        }
        const item = await tx.getItemForUpdate(input.itemId);
        if (!item) {
          return editorialError("item_not_found");
        }
        if (item.editorialStatus === "archived") {
          return editorialError("item_archived");
        }
        if (item.publicationMode === "automatic") {
          // Idempotent: releasing an unprotected item changes nothing and
          // writes no duplicate audit row.
          return {
            status: "ok" as const,
            value: { publicationMode: "automatic" as const, changed: false },
          };
        }
        const now = new Date();
        await tx.updateItem(item.id, {
          publicationMode: "automatic",
          protectionSetAt: null,
          protectionSetByUserId: null,
          updatedAt: now,
        });
        await tx.appendAuditEvent({
          actorUserId: capability.userId,
          action: "release_publication_protection",
          itemId: item.id,
          revisionId: item.latestPublishedRevisionId,
          overrideReason: reason,
          detail: {
            publicationModeBefore: item.publicationMode,
            publicationModeAfter: "automatic",
            protectionSetAtBefore: item.protectionSetAt
              ? new Date(item.protectionSetAt).toISOString()
              : null,
            reason,
            ...auditEditorIdentity(capability),
          },
        });
        return {
          status: "ok" as const,
          value: { publicationMode: "automatic" as const, changed: true },
        };
      });
    },

    /**
     * Phase 12 Stage 3 R2/R3 — retrieve the bounded recovery history of a human
     * draft: the complete document of every *retained* save, oldest first.
     * Recent saves are exactly recoverable, while snapshots beyond the
     * documented retention budget (25 saves / 2 MB per revision) have been
     * pruned, so this is a sliding recovery window rather than permanent
     * history. Published revisions are not part of this history (their content
     * is immutable in the revision row itself).
     */
    async getDraftHistory(input) {
      return await repository.run(async (tx) => {
        const capability = await requirePublicationAuthority(
          tx,
          input.actorUserId
        );
        if (isEditorialError(capability)) {
          return capability;
        }
        const item = await tx.getItemForUpdate(input.itemId);
        if (!item) {
          return editorialError("item_not_found");
        }
        if (item.editorialStatus === "archived") {
          return editorialError("item_archived");
        }
        const revision = await tx.getRevisionForUpdate(input.revisionId);
        if (!revision || revision.itemId !== item.id) {
          return editorialError("revision_not_found");
        }
        if (revision.contentKind === "ai_analysis") {
          return editorialError("not_a_draft");
        }
        const rows = await tx.listDraftSnapshots(
          revision.id,
          DRAFT_SNAPSHOT_MAX_PER_REVISION
        );
        const snapshots: DraftSnapshotDetail[] = rows.map((row) => {
          const parsed = policyHumanRevisionContentSchema.safeParse(
            row.humanContent
          );
          return {
            id: row.id,
            revisionId: row.revisionId,
            saveNumber: row.saveNumber,
            contentVersion: row.contentVersion,
            contentDigest: row.contentDigest,
            contentBytes: row.contentBytes,
            savedByUserId: row.savedByUserId,
            savedAt: iso(row.createdAt),
            humanContent: parsed.success ? parsed.data : null,
            contentValid: parsed.success,
          };
        });
        return { status: "ok" as const, value: { snapshots } };
      });
    },

    async grantPolicyEditor(input) {
      const email = input.email.trim().toLowerCase();
      const target = email ? await repository.findUserByEmail(email) : null;
      if (!email || !target) {
        return editorialError("user_not_found");
      }
      return await repository.run(async (tx) => {
        const actor = await tx.getActor(input.actorUserId);
        if (!actor) {
          return editorialError("unauthenticated");
        }
        // Administrative capability: an administrator manages grants. This is
        // deliberately separate from publication authority (D-065 R1), and the
        // admin identity must be verified (R2).
        if (actor.role !== "admin") {
          return editorialError("admin_required");
        }
        if (!actor.emailVerifiedAt) {
          return editorialError("identity_not_verified");
        }
        // D-070: grants extend editorial authority to *lawyers* only — a
        // verified Admin already holds inherent authority and needs none. A
        // grant against a customer account would therefore be meaningless and
        // is refused outright.
        if (target.role !== "lawyer") {
          return editorialError("grant_target_not_eligible", "not_a_lawyer");
        }
        if (!target.emailVerifiedAt) {
          return editorialError("grant_target_not_eligible", "unverified");
        }
        const now = new Date();
        // R3 P0: activation is the only path that can create/reactivate a
        // grant; it reports whether an existing (revoked) grant was reactivated.
        const activated = await tx.activatePolicyEditorGrant({
          userId: target.userId,
          adminUserId: actor.userId,
          now,
        });
        await tx.appendAuditEvent({
          actorUserId: actor.userId,
          action: "grant_policy_editor",
          itemId: null,
          revisionId: null,
          overrideReason: null,
          detail: {
            targetUserId: target.userId,
            targetEmail: target.email,
            targetRole: target.role,
            reactivated: activated.reactivated,
            ...auditEditorIdentity(actor),
          },
        });
        return {
          status: "ok" as const,
          value: { userId: target.userId, reactivated: activated.reactivated },
        };
      });
    },

    async revokePolicyEditor(input) {
      const email = input.email.trim().toLowerCase();
      const target = email ? await repository.findUserByEmail(email) : null;
      if (!email || !target) {
        return editorialError("user_not_found");
      }
      return await repository.run(async (tx) => {
        const actor = await tx.getActor(input.actorUserId);
        if (!actor) {
          return editorialError("unauthenticated");
        }
        if (actor.role !== "admin") {
          return editorialError("admin_required");
        }
        if (!actor.emailVerifiedAt) {
          return editorialError("identity_not_verified");
        }
        const now = new Date();
        // R3 P0: revocation is update-only and can never create a grant. A
        // revoke of a user who was never granted permission, or of an already
        // revoked grant, is a documented, audited no-op with a controlled
        // outcome instead of silently creating/keeping permission.
        const outcome = await tx.revokePolicyEditorGrant({
          userId: target.userId,
          adminUserId: actor.userId,
          now,
        });
        await tx.appendAuditEvent({
          actorUserId: actor.userId,
          action: "revoke_policy_editor",
          itemId: null,
          revisionId: null,
          overrideReason: null,
          detail: {
            targetUserId: target.userId,
            targetEmail: target.email,
            targetRole: target.role,
            outcome,
            ...auditEditorIdentity(actor),
          },
        });
        return {
          status: "ok" as const,
          value: { userId: target.userId, outcome },
        };
      });
    },

    async isAdministrator(actorUserId) {
      return await repository.run(async (tx) => {
        const actor = await tx.getActor(actorUserId);
        // D-070: a *verified* Admin is the firm's principal lawyer — inherent
        // editorial authority plus grant management. An unverified admin
        // manages nothing until the identity is verified (R2 rule retained).
        return actor?.role === "admin" && Boolean(actor.emailVerifiedAt);
      });
    },

    async listPolicyEditorGrants() {
      return await repository.listPolicyEditorGrants();
    },

    async listAuditTrail(itemId) {
      return await repository.listAuditEvents(itemId, EDITORIAL_AUDIT_LIMIT);
    },
  };
}
