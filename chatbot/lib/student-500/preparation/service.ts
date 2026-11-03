import { isStudent500Uuid, type Student500Context } from "../contracts";
import type { Student500ApplicationStore } from "../ports";
import type { Student500Screening } from "../requirement-resolver";
import type { Student500SchoolApplicationLinkResolver } from "../service";
import {
  isStudent500OutcomeProvenance,
  isStudent500SchoolContextKind,
  preparationDigest,
  STUDENT_500_GS_MAX_SECTIONS,
  STUDENT_500_PREPARATION_MAX_DRAFT_VERSIONS,
  STUDENT_500_PREPARATION_MAX_FACT_REFERENCES,
  STUDENT_500_PREPARATION_MAX_SNAPSHOT_VERSIONS,
  STUDENT_500_PREPARATION_SCHEMA,
  type Student500CoverageState,
  type Student500GsSection,
  type Student500OutcomeKind,
  type Student500PreparationAction,
  type Student500PreparationDisclosure,
  Student500PreparationError,
  type Student500SchoolContextKind,
  type Student500StaleReason,
  type Student500StudyEvidenceKind,
  validateOperationIdentity,
} from "./contracts";
import {
  buildStarterDraft,
  draftContentSha256,
  draftInputDigest,
  factDigestFor,
  normalizeEditedSections,
  redactUnreadableSections,
  renewSectionsForNewVersion,
} from "./gs-draft";
import type {
  NewSchoolContextValues,
  Student500AdmissionLinkResolver,
  Student500FactCandidate,
  Student500FactContextPort,
  Student500FactReferenceRecord,
  Student500GsDraftRecord,
  Student500PreparationOperationStamp,
  Student500PreparationSnapshotRecord,
  Student500PreparationStore,
  Student500SchoolContextRecord,
} from "./ports";
import {
  factReferenceState,
  type PreparationReconciliation,
  reconciliationFor,
  type SelectedFactView,
  staleReasonsForArtifact,
} from "./reconciliation";

/**
 * Phase 13 M6.2 preparation service.
 *
 * Owns: authorization, bounded validation, fact/evidence selection, requirement
 * coverage, provisional GS drafting, versioned preparation snapshots, selective
 * invalidation and view composition.
 *
 * Does NOT own: M2 fact storage/authorization (fact port), M5.1/M5.2 school
 * authority (resolvers), M6.1 legal screening (`screen`), persistence (store),
 * or any AI model call (none exists here).
 */

export type SelectedFactReferenceView = SelectedFactView;

export type SchoolContextView = {
  readonly kind: Student500SchoolContextKind;
  readonly studyEvidenceKind: Student500StudyEvidenceKind;
  readonly schoolApplicationId: string | null;
  readonly admissionCaseId: string | null;
  readonly admissionOutcomeKind: Student500OutcomeKind | null;
  readonly admissionOutcomeVersion: number | null;
  readonly admissionOutcomeProvenance: string | null;
  readonly admissionOutcomeIndependentlyVerified: boolean;
  readonly revision: number;
  readonly current: boolean;
  readonly unavailableReason: string | null;
  readonly updatedAt: string;
};

export type DraftVersionView = {
  readonly draftId: string;
  readonly version: number;
  readonly origin: "deterministic_starter" | "customer_edit";
  readonly label: "preliminary_structured_draft";
  /** Sections withheld from this response for present-time consent reasons. */
  readonly redactedSectionCount: number;
  readonly sections: Student500GsDraftRecord["sections"];
  readonly contentSha256: string;
  readonly sourceFactReferenceIds: readonly string[];
  readonly supersedesDraftId: string | null;
  readonly createdAt: string;
  readonly stale: boolean;
  readonly staleReasons: readonly Student500StaleReason[];
};

export type SnapshotVersionView = {
  readonly snapshotId: string;
  readonly version: number;
  readonly applicationRevision: number;
  readonly contentSha256: string;
  readonly gsDraftId: string | null;
  readonly createdAt: string;
  readonly stale: boolean;
  readonly staleReasons: readonly Student500StaleReason[];
  readonly content: unknown;
};

export type PreparationView = {
  readonly schemaVersion: typeof STUDENT_500_PREPARATION_SCHEMA;
  readonly projectId: string;
  readonly applicationId: string;
  readonly applicationStatus: string;
  readonly applicationRevision: number;
  readonly context: Student500Context;
  readonly screeningSubmissionStatus: "not_submission_ready";
  readonly schoolContext: SchoolContextView | null;
  readonly selectedFacts: readonly SelectedFactReferenceView[];
  /** Bounded, authorized fact candidates the customer may select. */
  readonly availableFacts: readonly {
    readonly factAssertionId: string;
    readonly version: number;
    readonly key: string;
    readonly valueDisplay: string;
    readonly customerConfirmed: boolean;
    readonly aiUseAuthorized: boolean;
    readonly originKind: string;
    readonly selectable: boolean;
  }[];
  readonly factsAvailable: boolean;
  readonly reconciliation: PreparationReconciliation;
  readonly documentsTrust: "unavailable";
  readonly drafts: readonly DraftVersionView[];
  readonly latestDraft: DraftVersionView | null;
  readonly snapshots: readonly SnapshotVersionView[];
  readonly latestSnapshot: SnapshotVersionView | null;
  readonly nextActions: readonly Student500PreparationAction[];
  readonly disclosures: readonly Student500PreparationDisclosure[];
  readonly limits: {
    readonly maxFactReferences: number;
    readonly maxDraftVersions: number;
    readonly maxSnapshotVersions: number;
    readonly maxSections: number;
  };
};

export type Student500PreparationServiceOptions = {
  readonly applications: Pick<
    Student500ApplicationStore,
    "readActorContext" | "getApplication" | "findOperation"
  >;
  readonly facts: Student500FactContextPort;
  readonly store: Student500PreparationStore;
  readonly screen: (input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly applicationId: string;
  }) => Promise<Student500Screening>;
  readonly schoolApplications?: Student500SchoolApplicationLinkResolver;
  readonly admissions?: Student500AdmissionLinkResolver;
};

/**
 * Fact references whose content the current actor may still read: the reference is
 * active AND its underlying fact is still present in this actor's projection.
 * Sharing consent revoked by another member removes the fact from the projection.
 */
function readableFactReferenceIdSet(input: {
  readonly candidateIds: ReadonlySet<string>;
  readonly references: readonly Student500FactReferenceRecord[];
}): Set<string> {
  return new Set(
    input.references
      .filter(
        (reference) =>
          reference.revokedAt === null &&
          input.candidateIds.has(reference.factAssertionId)
      )
      .map((reference) => reference.id)
  );
}

/**
 * The one response projection for a stored GS draft.
 *
 * Every draft representation - a fresh write, an exact idempotent replay, a
 * historical GET, or the preparation view - goes through here, so a revoked
 * sharing grant can never be re-disclosed through a mutation response. The stored
 * row and its `contentSha256` are untouched: only the served copy is narrowed.
 */
function projectDraftForResponse(
  draft: Student500GsDraftRecord,
  readable: ReadonlySet<string>
) {
  const redacted = redactUnreadableSections({
    readableFactReferenceIds: readable,
    sections: draft.sections,
  });
  return {
    ...draft,
    redactedSectionCount: redacted.redactedCount,
    sections: redacted.sections,
    sourceFactReferenceIds: draft.sourceFactReferenceIds.filter((id) =>
      readable.has(id)
    ),
  };
}

/**
 * Response projection for a fact-reference mutation (select / unselect).
 *
 * The stored record and the operation log are untouched: only the served copy is
 * narrowed. A reference the current actor may no longer read is returned in a
 * stable, explicitly redacted shape - no fact assertion id, key, origin, evidence
 * reference or provenance - while identity, version and replay result stay usable.
 */
export type Student500FactReferenceView = {
  readonly id: string;
  readonly projectId: string;
  readonly applicationId: string;
  /** False when the underlying fact is no longer readable by this actor. */
  readonly readable: boolean;
  readonly factVersion: number;
  readonly createdAt: string;
  readonly revokedAt: string | null;
  readonly factAssertionId: string | null;
  readonly factKey: string | null;
  readonly originKind: string | null;
  readonly stateAtUse: string | null;
  readonly aiUseAuthorizedAtSelection: boolean | null;
  readonly authorizationAudience: "none" | "actor_only" | "project";
  readonly sourceEvidenceRef: string | null;
};

function projectFactReferenceForResponse(
  record: Student500FactReferenceRecord,
  visibleFactAssertionIds: ReadonlySet<string>
): Student500FactReferenceView {
  const isReadable = visibleFactAssertionIds.has(record.factAssertionId);
  return {
    aiUseAuthorizedAtSelection: isReadable
      ? record.aiUseAuthorizedAtSelection
      : null,
    applicationId: record.applicationId,
    authorizationAudience: isReadable ? record.authorizationAudience : "none",
    createdAt: iso(record.createdAt),
    factAssertionId: isReadable ? record.factAssertionId : null,
    factKey: isReadable ? record.factKey : null,
    factVersion: record.factVersion,
    id: record.id,
    originKind: isReadable ? record.originKind : null,
    projectId: record.projectId,
    readable: isReadable,
    revokedAt: record.revokedAt ? iso(record.revokedAt) : null,
    sourceEvidenceRef: isReadable ? record.sourceEvidenceRef : null,
    stateAtUse: isReadable ? record.stateAtUse : null,
  };
}

/**
 * Response projection for the reconciliation view.
 *
 * Requirement evaluation itself is untouched; only the disclosed reference ids are
 * filtered to currently readable references. Coverage uncertainty, gaps and next
 * actions stay generic and never name a restricted fact.
 */
function projectReconciliationForResponse(
  reconciliation: PreparationReconciliation,
  readable: ReadonlySet<string>
): PreparationReconciliation {
  return {
    ...reconciliation,
    requirements: reconciliation.requirements.map((entry) => ({
      ...entry,
      selectedFactReferenceIds: entry.selectedFactReferenceIds.filter((id) =>
        readable.has(id)
      ),
    })),
  };
}

/** The one response projection for a stored preparation snapshot. */
function projectSnapshotForResponse(
  snapshot: Student500PreparationSnapshotRecord,
  readable: ReadonlySet<string>
) {
  return {
    ...snapshot,
    content: narrowSnapshotContent(snapshot.content, readable),
  };
}

/**
 * Narrows persisted snapshot metadata to currently readable fact references.
 * Fact identity lists and per-fact digests are dropped for references this actor may
 * no longer read; no value, key or reference id of a hidden fact is returned, and no
 * description of it is fabricated.
 */
function narrowSnapshotContent(
  content: unknown,
  readable: ReadonlySet<string>
): unknown {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return content;
  }
  const record = content as Record<string, unknown>;
  const narrowed: Record<string, unknown> = { ...record };
  const factDigests = record.factDigests;
  if (Array.isArray(factDigests)) {
    narrowed.factDigests = factDigests.filter((entry) => {
      const referenceId =
        entry && typeof entry === "object"
          ? (entry as Record<string, unknown>).factReferenceId
          : null;
      return typeof referenceId === "string" && readable.has(referenceId);
    });
  }
  const factReferences = record.factReferences;
  if (Array.isArray(factReferences)) {
    narrowed.factReferences = factReferences.filter((entry) => {
      const referenceId =
        entry && typeof entry === "object"
          ? (entry as Record<string, unknown>).factReferenceId
          : null;
      return typeof referenceId === "string" && readable.has(referenceId);
    });
  }
  const factReferenceIds = record.factReferenceIds;
  if (Array.isArray(factReferenceIds)) {
    narrowed.factReferenceIds = factReferenceIds.filter(
      (id): id is string => typeof id === "string" && readable.has(id)
    );
  }
  return narrowed;
}

function iso(value: Date): string {
  return value.toISOString();
}

function schoolContextSummary(
  record: Student500SchoolContextRecord | null
): unknown {
  if (!record) {
    return null;
  }
  return {
    admissionCaseId: record.admissionCaseId,
    admissionOutcomeKind: record.admissionOutcomeKind,
    admissionOutcomeProvenance: record.admissionOutcomeProvenance,
    admissionOutcomeVerified: record.admissionOutcomeVerified,
    admissionOutcomeVersion: record.admissionOutcomeVersion,
    kind: record.kind,
    revision: record.revision,
    schoolApplicationId: record.schoolApplicationId,
    studyEvidenceKind: record.studyEvidenceKind,
  };
}

export function createStudent500PreparationService(
  options: Student500PreparationServiceOptions
) {
  const { applications, facts, store, screen } = options;

  /** Fact assertion ids whose content this actor may currently read. */
  async function currentVisibleFactAssertionIds(input: {
    readonly actorUserId: string;
    readonly projectId: string;
  }): Promise<Set<string>> {
    const context = await factContext(input);
    return new Set(
      liveCandidates(context).map((candidate) => candidate.factAssertionId)
    );
  }

  /** Current-time readable fact references for an application read boundary. */
  async function currentReadableFactReferenceIds(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly applicationId: string;
  }): Promise<Set<string>> {
    const [references, context] = await Promise.all([
      store.listFactReferences({ applicationId: input.applicationId }),
      factContext(input),
    ]);
    return readableFactReferenceIdSet({
      candidateIds: new Set(
        liveCandidates(context).map((candidate) => candidate.factAssertionId)
      ),
      references,
    });
  }

  async function authorize(input: {
    readonly actorUserId: string;
    readonly projectId: string;
  }) {
    if (
      !(
        isStudent500Uuid(input.actorUserId) && isStudent500Uuid(input.projectId)
      )
    ) {
      throw new Student500PreparationError("invalid_request");
    }
    const context = await applications.readActorContext({ ...input });
    if (context.staff || !context.registeredCustomer) {
      throw new Student500PreparationError("actor_not_eligible");
    }
    if (!context.project) {
      throw new Student500PreparationError("project_not_found");
    }
    const authorized =
      context.project.ownerUserId === input.actorUserId ||
      context.membershipStatus === "active_member";
    if (!authorized) {
      throw new Student500PreparationError("project_forbidden");
    }
    return context;
  }

  function assertWritable(context: Awaited<ReturnType<typeof authorize>>) {
    if (context.project?.status !== "active") {
      throw new Student500PreparationError("project_closed");
    }
  }

  /**
   * A preparation record is always owner-scoped: the M6.1 store filters by
   * `ownerUserId`, so another Project member can neither read nor write it even
   * though they may see the Project.
   */
  async function requireApplication(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly applicationId: string;
  }) {
    if (!isStudent500Uuid(input.applicationId)) {
      throw new Student500PreparationError("invalid_request");
    }
    const application = await applications.getApplication({
      applicationId: input.applicationId,
      ownerUserId: input.actorUserId,
      projectId: input.projectId,
    });
    if (!application) {
      throw new Student500PreparationError("application_not_found");
    }
    return application;
  }

  function operationStamp(input: {
    readonly actorUserId: string;
    readonly request: unknown;
    readonly operationId: string;
    readonly operationType: Student500PreparationOperationStamp["operationType"];
    readonly resultKind: Student500PreparationOperationStamp["resultKind"];
  }): Student500PreparationOperationStamp {
    return {
      actorUserId: input.actorUserId,
      operationId: validateOperationIdentity(input.operationId),
      operationType: input.operationType,
      requestSha256: preparationDigest(input.request),
      resultKind: input.resultKind,
    };
  }

  type Artifact =
    | {
        readonly kind: "fact_reference";
        readonly value: Student500FactReferenceRecord;
      }
    | {
        readonly kind: "school_context";
        readonly value: Student500SchoolContextRecord;
      }
    | { readonly kind: "gs_draft"; readonly value: Student500GsDraftRecord }
    | {
        readonly kind: "snapshot";
        readonly value: Student500PreparationSnapshotRecord;
      }
    | {
        readonly kind: "fact_reference_removed";
        readonly value: Student500FactReferenceRecord;
      };

  /**
   * Exact-replay resolution. A replayed operation must return the artifact that was
   * actually persisted, resolved by its recorded result id - never a new one.
   */
  async function replayedArtifact(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly applicationId: string;
    readonly operation: Student500PreparationOperationStamp;
  }): Promise<Artifact | null> {
    const found = await store.findOperation(input.operation);
    if (found.status === "absent") {
      return null;
    }
    if (found.status === "conflict") {
      throw new Student500PreparationError("idempotency_conflict");
    }
    switch (found.resultKind) {
      case "student_500_fact_reference": {
        const references = await store.listFactReferences({
          applicationId: input.applicationId,
        });
        const match = references.find((entry) => entry.id === found.resultId);
        if (!match) {
          throw new Student500PreparationError("integrity_conflict");
        }
        return {
          kind:
            match.revokedAt === null
              ? "fact_reference"
              : "fact_reference_removed",
          value: match,
        };
      }
      case "student_500_school_context": {
        const context = await store.getSchoolContext({
          applicationId: input.applicationId,
        });
        if (!context || context.id !== found.resultId) {
          throw new Student500PreparationError("integrity_conflict");
        }
        return { kind: "school_context", value: context };
      }
      case "student_500_gs_draft": {
        const draft = await store.getDraft({
          applicationId: input.applicationId,
          draftId: found.resultId,
          projectId: input.projectId,
        });
        if (!draft) {
          throw new Student500PreparationError("integrity_conflict");
        }
        return { kind: "gs_draft", value: draft };
      }
      case "student_500_preparation_snapshot": {
        const snapshot = await store.getSnapshot({
          applicationId: input.applicationId,
          projectId: input.projectId,
          snapshotId: found.resultId,
        });
        if (!snapshot) {
          throw new Student500PreparationError("integrity_conflict");
        }
        return { kind: "snapshot", value: snapshot };
      }
      default:
        throw new Student500PreparationError("integrity_conflict");
    }
  }

  async function factContext(input: {
    readonly actorUserId: string;
    readonly projectId: string;
  }) {
    try {
      return await facts.list({ ...input });
    } catch {
      return {
        reason: "fact_projection_unavailable",
        status: "unavailable" as const,
      };
    }
  }

  function liveCandidates(
    result: Awaited<ReturnType<typeof factContext>>
  ): readonly Student500FactCandidate[] {
    return result.status === "available" ? result.facts : [];
  }

  async function composeState(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly applicationId: string;
  }) {
    const application = await requireApplication(input);
    const archived = application.status === "archived";
    const [screening, references, context, schoolContext, drafts, snapshots] =
      await Promise.all([
        screen({ ...input }),
        store.listFactReferences({ applicationId: input.applicationId }),
        factContext(input),
        store.getSchoolContext({ applicationId: input.applicationId }),
        store.listDrafts({ applicationId: input.applicationId }),
        store.listSnapshots({ applicationId: input.applicationId }),
      ]);
    const candidates = liveCandidates(context);
    const candidateById = new Map(
      candidates.map((candidate) => [candidate.factAssertionId, candidate])
    );
    const activeReferences = references.filter(
      (entry) => entry.revokedAt === null
    );
    const selected: SelectedFactReferenceView[] = activeReferences.map(
      (reference) => {
        const candidate = candidateById.get(reference.factAssertionId) ?? null;
        const live = factReferenceState({
          applicationArchived: archived,
          candidate,
          reference,
        });
        const currentState = ((): Student500CoverageState => {
          switch (live.state) {
            case "covered_by_authorized_fact":
              return "covered_by_authorized_fact";
            case "blocked_fact_conflicting":
              return "blocked_fact_conflicting";
            case "blocked_fact_revoked":
              return "blocked_fact_revoked";
            case "blocked_fact_not_ai_authorized":
              return "blocked_fact_not_ai_authorized";
            case "blocked_fact_stale":
              return "blocked_fact_stale";
            default:
              return "blocked_fact_stale";
          }
        })();
        return {
          aiUseAuthorized: candidate?.aiUseAuthorized === true,
          currentState,
          customerConfirmed: candidate?.customerConfirmed === true,
          factAssertionId: reference.factAssertionId,
          factKey: reference.factKey,
          factReferenceId: reference.id,
          factVersion: reference.factVersion,
          independentlyVerified: false,
          originKind: reference.originKind,
          revokedAt: null,
          sourceEvidenceRef: reference.sourceEvidenceRef,
          stateAtUse: reference.stateAtUse,
        };
      }
    );

    // Re-resolve the linked M5 evidence on every read: a stored snapshot is
    // never assumed to be current.
    const schoolValidation = await revalidateSchoolContext({
      actorUserId: input.actorUserId,
      projectId: input.projectId,
      record: schoolContext,
    });
    const currentContextDigest = preparationDigest(application.context);
    const currentSchoolDigest = schoolValidation.liveDigest;
    const currentFactDigests = selected.map((entry) =>
      factDigestFor({
        factAssertionId: entry.factAssertionId,
        factKey: entry.factKey,
        factReferenceId: entry.factReferenceId,
        factVersion: entry.factVersion,
        state: entry.currentState,
      })
    );
    const recomputedInputDigest = draftInputDigest({
      applicationId: input.applicationId,
      applicationRevision: application.revision,
      asOfDate: application.context.asOfDate,
      contextDigest: currentContextDigest,
      factDigests: currentFactDigests,
      schoolContextDigest: currentSchoolDigest,
    });
    const referenceById = new Map(references.map((entry) => [entry.id, entry]));
    const currentIds = selected.map((entry) => entry.factReferenceId);
    // Present-time disclosure control for stored draft text: a reference is
    // readable only while it is active AND its underlying fact is still visible
    // to this actor. Consent revoked by another member removes the fact from this
    // actor's projection, so previously drafted source text must not be served.
    const readableFactReferenceIds = readableFactReferenceIdSet({
      candidateIds: new Set(candidateById.keys()),
      references,
    });

    const draftViews: DraftVersionView[] = drafts.map((draft) => {
      const reasons = staleReasonsForArtifact({
        applicationRevisionAdvanced: false,
        artifactFactReferenceIds: draft.sourceFactReferenceIds.filter((id) =>
          referenceById.has(id)
        ),
        candidates,
        currentFactReferenceIds: currentIds,
        inputDigestMatches: draft.inputDigest === recomputedInputDigest,
        references,
        schoolContextDigestMatches: true,
        schoolContextUnavailable: !schoolValidation.current,
        schoolOutcomeSuperseded:
          schoolValidation.unavailableReason ===
            "admission_outcome_superseded" ||
          schoolValidation.unavailableReason === "admission_outcome_changed",
      });
      const projected = projectDraftForResponse(
        draft,
        readableFactReferenceIds
      );
      return {
        contentSha256: draft.contentSha256,
        createdAt: iso(draft.createdAt),
        draftId: draft.id,
        label: "preliminary_structured_draft",
        origin: draft.origin,
        redactedSectionCount: projected.redactedSectionCount,
        sections: projected.sections,
        sourceFactReferenceIds: projected.sourceFactReferenceIds,
        stale: reasons.length > 0,
        staleReasons: reasons,
        supersedesDraftId: draft.supersedesDraftId,
        version: draft.version,
      };
    });

    const snapshotViews: SnapshotVersionView[] = snapshots.map((snapshot) => {
      const content = snapshot.content as {
        readonly applicationRevision?: number;
        readonly inputDigest?: string;
        readonly schoolContextDigest?: string;
        readonly factDigests?: readonly string[];
        readonly factReferenceIds?: readonly string[];
      };
      const reasons = staleReasonsForArtifact({
        applicationRevisionAdvanced:
          typeof content.applicationRevision === "number" &&
          content.applicationRevision !== application.revision,
        artifactFactReferenceIds: Array.isArray(content.factReferenceIds)
          ? content.factReferenceIds.filter((id) => referenceById.has(id))
          : [],
        candidates,
        currentFactReferenceIds: currentIds,
        inputDigestMatches: true,
        references,
        schoolContextDigestMatches:
          content.schoolContextDigest === currentSchoolDigest,
        schoolContextUnavailable: !schoolValidation.current,
        schoolOutcomeSuperseded:
          schoolValidation.unavailableReason ===
            "admission_outcome_superseded" ||
          schoolValidation.unavailableReason === "admission_outcome_changed",
      });
      return {
        applicationRevision: snapshot.applicationRevision,
        content: projectSnapshotForResponse(snapshot, readableFactReferenceIds)
          .content,
        contentSha256: snapshot.contentSha256,
        createdAt: iso(snapshot.createdAt),
        gsDraftId: snapshot.gsDraftId,
        snapshotId: snapshot.id,
        stale: reasons.length > 0,
        staleReasons: reasons,
        version: snapshot.version,
      };
    });

    const reconciliation = reconciliationFor({
      applicationArchived: archived,
      candidates,
      factsAvailable: context.status === "available",
      factsUnavailableReason:
        context.status === "available" ? null : context.reason,
      hasDraft: drafts.length > 0,
      references,
      schoolContext,
      screening,
    });

    const selectedIds = new Set(
      activeReferences.map((entry) => entry.factAssertionId)
    );
    const availableFacts = candidates
      .map((candidate) => ({
        aiUseAuthorized: candidate.aiUseAuthorized,
        customerConfirmed: candidate.customerConfirmed,
        factAssertionId: candidate.factAssertionId,
        key: candidate.key,
        originKind: candidate.originKind,
        selectable: !selectedIds.has(candidate.factAssertionId),
        valueDisplay: candidate.valueDisplay,
        version: candidate.version,
      }))
      .sort((left, right) =>
        left.key === right.key
          ? left.version - right.version
          : left.key.localeCompare(right.key)
      );

    return {
      application,
      archived,
      availableFacts,
      draftViews,
      factsAvailable: context.status === "available",
      readableFactReferenceIds,
      reconciliation,
      schoolContext,
      schoolValidation,
      selected: selected.filter((entry) =>
        readableFactReferenceIds.has(entry.factReferenceId)
      ),
      snapshotViews,
      context,
      currentInputDigest: recomputedInputDigest,
      currentSchoolDigest,
      currentFactDigests,
      candidates,
      references,
      screening,
    };
  }

  /**
   * Re-resolves the persisted school/Offer/CoE reference through the existing M5
   * services on every read. A stored snapshot is never assumed current: a
   * superseded outcome, an archived application or a revoked membership makes the
   * link explicitly unavailable instead of silently stale-but-fine.
   */
  async function revalidateSchoolContext(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly record: Student500SchoolContextRecord | null;
  }): Promise<{
    readonly current: boolean;
    readonly liveDigest: string;
    readonly unavailableReason: string | null;
  }> {
    const record = input.record;
    if (!record) {
      return {
        current: true,
        liveDigest: preparationDigest(null),
        unavailableReason: null,
      };
    }
    if (record.kind === "school_application") {
      const resolved =
        options.schoolApplications && record.schoolApplicationId
          ? await options.schoolApplications.resolve({
              actorUserId: input.actorUserId,
              applicationId: record.schoolApplicationId,
              projectId: input.projectId,
            })
          : ({ status: "forbidden" } as const);
      if (resolved.status !== "resolved") {
        return {
          current: false,
          liveDigest: preparationDigest([
            "school_application_unavailable",
            record.schoolApplicationId,
            resolved.status,
          ]),
          unavailableReason:
            resolved.status === "not_found"
              ? "school_application_not_found"
              : "school_application_forbidden",
        };
      }
      const archived = resolved.applicationStatus === "archived";
      return {
        current: !archived,
        // The selected record identity participates in the digest, so moving from
        // one authorized application to another with identical status still
        // invalidates dependent drafts and snapshots.
        liveDigest: preparationDigest([
          "school_application",
          record.schoolApplicationId,
          resolved.applicationStatus,
          resolved.sourceStatus,
        ]),
        unavailableReason: archived ? "school_application_archived" : null,
      };
    }
    if (record.kind === "admission_case") {
      const resolved =
        options.admissions && record.admissionCaseId
          ? await options.admissions.resolve({
              actorUserId: input.actorUserId,
              caseId: record.admissionCaseId,
              projectId: input.projectId,
            })
          : ({ status: "forbidden" } as const);
      if (resolved.status !== "resolved") {
        return {
          current: false,
          liveDigest: preparationDigest([
            "admission_case_unavailable",
            record.admissionCaseId,
            resolved.status,
          ]),
          unavailableReason:
            resolved.status === "not_found"
              ? "admission_case_not_found"
              : "admission_case_forbidden",
        };
      }
      const live =
        resolved.coe && !resolved.coe.superseded
          ? resolved.coe
          : resolved.offer && !resolved.offer.superseded
            ? resolved.offer
            : null;
      const liveDigest = preparationDigest(
        live
          ? [
              "admission_case",
              record.admissionCaseId,
              live.kind,
              live.version,
              live.provenance,
              live.independentlyVerified,
              resolved.revision,
            ]
          : [
              "admission_case",
              record.admissionCaseId,
              "no_current_outcome",
              resolved.revision,
            ]
      );
      if (!live) {
        return {
          current: record.admissionOutcomeKind === null,
          liveDigest,
          unavailableReason:
            record.admissionOutcomeKind === null
              ? null
              : "admission_outcome_superseded",
        };
      }
      const unchanged =
        record.admissionOutcomeKind === live.kind &&
        record.admissionOutcomeVersion === live.version &&
        record.admissionOutcomeProvenance === live.provenance;
      return {
        current: unchanged,
        liveDigest,
        unavailableReason: unchanged ? null : "admission_outcome_changed",
      };
    }
    // `none` and a directly reported CoE have no external authority to re-check.
    return {
      current: true,
      liveDigest: preparationDigest(schoolContextSummary(record)),
      unavailableReason: null,
    };
  }

  function schoolContextView(input: {
    readonly record: Student500SchoolContextRecord | null;
    readonly applicationArchived: boolean;
    readonly validation: {
      readonly current: boolean;
      readonly unavailableReason: string | null;
    };
  }): SchoolContextView | null {
    const record = input.record;
    if (!record) {
      return null;
    }
    return {
      admissionCaseId: record.admissionCaseId,
      admissionOutcomeIndependentlyVerified:
        record.admissionOutcomeVerified === true,
      admissionOutcomeKind: record.admissionOutcomeKind,
      admissionOutcomeProvenance: record.admissionOutcomeProvenance,
      admissionOutcomeVersion: record.admissionOutcomeVersion,
      current: !input.applicationArchived && input.validation.current,
      kind: record.kind,
      revision: record.revision,
      schoolApplicationId: record.schoolApplicationId,
      studyEvidenceKind: record.studyEvidenceKind,
      unavailableReason: input.validation.unavailableReason,
      updatedAt: iso(record.updatedAt),
    };
  }

  async function view(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly applicationId: string;
  }): Promise<PreparationView> {
    // Explicit current Project/membership authorization: the read path must not rely
    // solely on the screening dependency for authority.
    await authorize(input);
    const state = await composeState(input);
    const latestDraft = state.draftViews.at(-1) ?? null;
    const latestSnapshot = state.snapshotViews.at(-1) ?? null;
    return {
      applicationId: input.applicationId,
      applicationRevision: state.application.revision,
      applicationStatus: state.application.status,
      availableFacts: state.availableFacts,
      context: state.application.context,
      disclosures: state.reconciliation.disclosures,
      documentsTrust: "unavailable",
      drafts: state.draftViews,
      factsAvailable: state.factsAvailable,
      latestDraft,
      latestSnapshot,
      limits: {
        maxDraftVersions: STUDENT_500_PREPARATION_MAX_DRAFT_VERSIONS,
        maxFactReferences: STUDENT_500_PREPARATION_MAX_FACT_REFERENCES,
        maxSections: STUDENT_500_GS_MAX_SECTIONS,
        maxSnapshotVersions: STUDENT_500_PREPARATION_MAX_SNAPSHOT_VERSIONS,
      },
      nextActions: state.reconciliation.nextActions,
      projectId: input.projectId,
      reconciliation: projectReconciliationForResponse(
        state.reconciliation,
        state.readableFactReferenceIds
      ),
      schemaVersion: STUDENT_500_PREPARATION_SCHEMA,
      schoolContext: schoolContextView({
        applicationArchived: state.archived,
        record: state.schoolContext,
        validation: state.schoolValidation,
      }),
      screeningSubmissionStatus: "not_submission_ready",
      selectedFacts: state.selected,
      snapshots: state.snapshotViews,
    };
  }

  return {
    get: view,

    async getDraft(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly applicationId: string;
      readonly draftId: string;
    }) {
      await authorize(input);
      await requireApplication(input);
      if (!isStudent500Uuid(input.draftId)) {
        throw new Student500PreparationError("invalid_request");
      }
      const draft = await store.getDraft(input);
      if (!draft) {
        throw new Student500PreparationError("draft_not_found");
      }
      // The independent draft read applies exactly the same present-time
      // disclosure control as the preparation view: a stored version is immutable
      // in the database, but source-derived text is only served while the current
      // actor may still read the underlying fact.
      return projectDraftForResponse(
        draft,
        await currentReadableFactReferenceIds(input)
      );
    },

    async getSnapshot(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly applicationId: string;
      readonly snapshotId: string;
    }) {
      await authorize(input);
      await requireApplication(input);
      if (!isStudent500Uuid(input.snapshotId)) {
        throw new Student500PreparationError("invalid_request");
      }
      const snapshot = await store.getSnapshot(input);
      if (!snapshot) {
        throw new Student500PreparationError("snapshot_not_found");
      }
      // Snapshot metadata names fact identities, so it is narrowed with the same
      // present-time rule. The stored row is not modified.
      return projectSnapshotForResponse(
        snapshot,
        await currentReadableFactReferenceIds(input)
      );
    },

    async selectFact(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly applicationId: string;
      readonly factAssertionId: string;
      readonly factVersion: number;
      readonly operationId: string;
    }) {
      const context = await authorize(input);
      assertWritable(context);
      const application = await requireApplication(input);
      if (application.status === "archived") {
        throw new Student500PreparationError("application_archived");
      }
      if (
        !isStudent500Uuid(input.factAssertionId) ||
        !Number.isSafeInteger(input.factVersion) ||
        input.factVersion < 1
      ) {
        throw new Student500PreparationError("invalid_request");
      }
      const request = {
        action: "select_fact",
        applicationId: input.applicationId,
        factAssertionId: input.factAssertionId,
        factVersion: input.factVersion,
        projectId: input.projectId,
      };
      const operation = operationStamp({
        actorUserId: input.actorUserId,
        operationId: input.operationId,
        operationType: "student_500_select_fact",
        request,
        resultKind: "student_500_fact_reference",
      });
      const replay = await replayedArtifact({
        actorUserId: input.actorUserId,
        applicationId: input.applicationId,
        operation,
        projectId: input.projectId,
      });
      if (replay) {
        return {
          reference: projectFactReferenceForResponse(
            replay.value as Student500FactReferenceRecord,
            await currentVisibleFactAssertionIds(input)
          ),
          replayed: true,
        };
      }

      const observed = await factContext(input);
      if (observed.status !== "available") {
        throw new Student500PreparationError("fact_not_available");
      }
      const candidate = observed.facts.find(
        (entry) => entry.factAssertionId === input.factAssertionId
      );
      if (!candidate || candidate.version !== input.factVersion) {
        // Selecting an exact version only: a stale version number is unavailable,
        // never silently upgraded to a newer one.
        throw new Student500PreparationError("fact_not_available");
      }
      const count = await store.countFactReferences({
        applicationId: input.applicationId,
      });
      if (count >= STUDENT_500_PREPARATION_MAX_FACT_REFERENCES) {
        throw new Student500PreparationError("limit_exceeded");
      }
      const result = await store.insertFactReference({
        aiUseAuthorizedAtSelection: candidate.aiUseAuthorized,
        applicationId: input.applicationId,
        authorizationActorUserId: candidate.authorizationActorUserId,
        authorizationAudience: candidate.authorizedAudience,
        createdByUserId: input.actorUserId,
        factAssertionId: candidate.factAssertionId,
        factKey: candidate.key,
        factVersion: candidate.version,
        operation,
        originKind: candidate.originKind,
        projectId: input.projectId,
        sourceEvidenceRef: candidate.sourceEvidenceRef,
        stateAtUse: candidate.state,
      });
      return {
        reference: projectFactReferenceForResponse(
          result.value,
          await currentVisibleFactAssertionIds(input)
        ),
        replayed: result.replayed,
      };
    },

    async unselectFact(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly applicationId: string;
      readonly factReferenceId: string;
      readonly operationId: string;
    }) {
      const context = await authorize(input);
      assertWritable(context);
      const application = await requireApplication(input);
      if (application.status === "archived") {
        throw new Student500PreparationError("application_archived");
      }
      if (!isStudent500Uuid(input.factReferenceId)) {
        throw new Student500PreparationError("invalid_request");
      }
      const request = {
        action: "unselect_fact",
        applicationId: input.applicationId,
        factReferenceId: input.factReferenceId,
        projectId: input.projectId,
      };
      const operation = operationStamp({
        actorUserId: input.actorUserId,
        operationId: input.operationId,
        operationType: "student_500_unselect_fact",
        request,
        resultKind: "student_500_fact_reference",
      });
      const replay = await replayedArtifact({
        actorUserId: input.actorUserId,
        applicationId: input.applicationId,
        operation,
        projectId: input.projectId,
      });
      if (replay) {
        return {
          reference: projectFactReferenceForResponse(
            replay.value as Student500FactReferenceRecord,
            await currentVisibleFactAssertionIds(input)
          ),
          replayed: true,
        };
      }
      const result = await store.revokeFactReference({
        actorUserId: input.actorUserId,
        applicationId: input.applicationId,
        factReferenceId: input.factReferenceId,
        operation,
        projectId: input.projectId,
      });
      return {
        reference: projectFactReferenceForResponse(
          result.value,
          await currentVisibleFactAssertionIds(input)
        ),
        replayed: result.replayed,
      };
    },

    async setSchoolContext(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly applicationId: string;
      readonly kind: string;
      readonly schoolApplicationId: string | null;
      readonly admissionCaseId: string | null;
      readonly expectedRevision: number | null;
      readonly operationId: string;
    }) {
      const context = await authorize(input);
      assertWritable(context);
      const application = await requireApplication(input);
      if (application.status === "archived") {
        throw new Student500PreparationError("application_archived");
      }
      if (!isStudent500SchoolContextKind(input.kind)) {
        throw new Student500PreparationError("invalid_request");
      }

      // The server derives study-evidence state and provenance. A client can never
      // assert a verified CoE, a provenance rank or an Offer it does not hold.
      let values: NewSchoolContextValues;
      if (input.kind === "none") {
        values = {
          admissionCaseId: null,
          admissionOutcomeKind: null,
          admissionOutcomeProvenance: null,
          admissionOutcomeVerified: null,
          admissionOutcomeVersion: null,
          kind: "none",
          schoolApplicationId: null,
          studyEvidenceKind: "none",
        };
      } else if (input.kind === "customer_reported_coe") {
        values = {
          admissionCaseId: null,
          admissionOutcomeKind: "coe",
          admissionOutcomeProvenance: "customer_reported",
          admissionOutcomeVerified: false,
          admissionOutcomeVersion: 1,
          kind: "customer_reported_coe",
          schoolApplicationId: null,
          studyEvidenceKind: "coe_reported",
        };
      } else if (input.kind === "school_application") {
        if (!input.schoolApplicationId || input.admissionCaseId !== null) {
          throw new Student500PreparationError("invalid_request");
        }
        const resolved = options.schoolApplications
          ? await options.schoolApplications.resolve({
              actorUserId: input.actorUserId,
              applicationId: input.schoolApplicationId,
              projectId: input.projectId,
            })
          : ({ status: "forbidden" } as const);
        if (resolved.status !== "resolved") {
          throw new Student500PreparationError("school_context_unavailable");
        }
        if (resolved.applicationStatus === "archived") {
          throw new Student500PreparationError("school_context_invalid");
        }
        values = {
          admissionCaseId: null,
          admissionOutcomeKind: null,
          admissionOutcomeProvenance: null,
          admissionOutcomeVerified: null,
          admissionOutcomeVersion: null,
          kind: "school_application",
          schoolApplicationId: input.schoolApplicationId,
          // An in-progress school application is never an Offer or a CoE.
          studyEvidenceKind: "none",
        };
      } else {
        if (!input.admissionCaseId || input.schoolApplicationId !== null) {
          throw new Student500PreparationError("invalid_request");
        }
        const resolved = options.admissions
          ? await options.admissions.resolve({
              actorUserId: input.actorUserId,
              caseId: input.admissionCaseId,
              projectId: input.projectId,
            })
          : ({ status: "forbidden" } as const);
        if (resolved.status !== "resolved") {
          throw new Student500PreparationError("school_context_unavailable");
        }
        const outcome =
          resolved.coe && !resolved.coe.superseded
            ? resolved.coe
            : resolved.offer && !resolved.offer.superseded
              ? resolved.offer
              : null;
        if (outcome && !isStudent500OutcomeProvenance(outcome.provenance)) {
          throw new Student500PreparationError("school_context_invalid");
        }
        const studyEvidenceKind: Student500StudyEvidenceKind = outcome
          ? outcome.kind === "coe"
            ? outcome.independentlyVerified
              ? "coe_independently_verified"
              : "coe_reported"
            : "offer_only"
          : "none";
        values = {
          admissionCaseId: input.admissionCaseId,
          admissionOutcomeKind: outcome ? outcome.kind : null,
          admissionOutcomeProvenance: outcome
            ? (outcome.provenance as NewSchoolContextValues["admissionOutcomeProvenance"])
            : null,
          admissionOutcomeVerified: outcome
            ? outcome.independentlyVerified
            : null,
          admissionOutcomeVersion: outcome ? outcome.version : null,
          kind: "admission_case",
          schoolApplicationId: null,
          studyEvidenceKind,
        };
      }

      const request = {
        action: "set_school_context",
        admissionCaseId: input.admissionCaseId,
        applicationId: input.applicationId,
        kind: input.kind,
        projectId: input.projectId,
        schoolApplicationId: input.schoolApplicationId,
      };
      const operation = operationStamp({
        actorUserId: input.actorUserId,
        operationId: input.operationId,
        operationType: "student_500_set_school_context",
        request,
        resultKind: "student_500_school_context",
      });
      const replay = await replayedArtifact({
        actorUserId: input.actorUserId,
        applicationId: input.applicationId,
        operation,
        projectId: input.projectId,
      });
      if (replay) {
        return {
          replayed: true,
          schoolContext: replay.value as Student500SchoolContextRecord,
        };
      }
      const result = await store.putSchoolContext({
        actorUserId: input.actorUserId,
        applicationId: input.applicationId,
        expectedRevision: input.expectedRevision,
        operation,
        projectId: input.projectId,
        values,
      });
      return { replayed: result.replayed, schoolContext: result.value };
    },

    async createDraft(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly applicationId: string;
      readonly operationId: string;
    }) {
      const context = await authorize(input);
      assertWritable(context);
      const application = await requireApplication(input);
      if (application.status === "archived") {
        throw new Student500PreparationError("application_archived");
      }
      const request = {
        action: "create_gs_draft",
        applicationId: input.applicationId,
        projectId: input.projectId,
      };
      const operation = operationStamp({
        actorUserId: input.actorUserId,
        operationId: input.operationId,
        operationType: "student_500_create_gs_draft",
        request,
        resultKind: "student_500_gs_draft",
      });
      const replay = await replayedArtifact({
        actorUserId: input.actorUserId,
        applicationId: input.applicationId,
        operation,
        projectId: input.projectId,
      });
      if (replay) {
        return {
          draft: projectDraftForResponse(
            replay.value as Student500GsDraftRecord,
            await currentReadableFactReferenceIds(input)
          ),
          replayed: true,
        };
      }
      const count = await store.countDrafts({
        applicationId: input.applicationId,
      });
      if (count >= STUDENT_500_PREPARATION_MAX_DRAFT_VERSIONS) {
        throw new Student500PreparationError("limit_exceeded");
      }
      const state = await composeState(input);
      // Dependency identity for this version: every authorized input it was built
      // from (not only the facts that produced text in a section), so a later
      // change to any input invalidates exactly this version.
      const usable = state.selected.filter(
        (entry) => entry.currentState === "covered_by_authorized_fact"
      );
      const starter = buildStarterDraft(
        usable.map((entry) => ({
          factAssertionId: entry.factAssertionId,
          factKey: entry.factKey,
          factReferenceId: entry.factReferenceId,
          factVersion: entry.factVersion,
          originKind: entry.originKind,
          valueDisplay:
            state.availableFacts.find(
              (fact) => fact.factAssertionId === entry.factAssertionId
            )?.valueDisplay ?? "",
        }))
      );
      const result = await store.insertDraft({
        actorUserId: input.actorUserId,
        applicationId: input.applicationId,
        operation,
        projectId: input.projectId,
        values: {
          contentSha256: draftContentSha256(starter.sections),
          expectedPreviousVersion: null,
          inputDigest: state.currentInputDigest,
          origin: "deterministic_starter",
          sections: starter.sections,
          sourceFactReferenceIds: usable
            .map((entry) => entry.factReferenceId)
            .sort(),
          supersedesDraftId: null,
        },
      });
      return {
        draft: projectDraftForResponse(
          result.value,
          await currentReadableFactReferenceIds(input)
        ),
        replayed: result.replayed,
      };
    },

    async saveDraft(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly applicationId: string;
      readonly baseDraftId: string;
      readonly edits: readonly {
        readonly sectionKey: string;
        readonly text: string;
      }[];
      readonly operationId: string;
    }) {
      const context = await authorize(input);
      assertWritable(context);
      const application = await requireApplication(input);
      if (application.status === "archived") {
        throw new Student500PreparationError("application_archived");
      }
      if (!isStudent500Uuid(input.baseDraftId)) {
        throw new Student500PreparationError("invalid_request");
      }
      if (
        input.edits.length === 0 ||
        input.edits.length > STUDENT_500_GS_MAX_SECTIONS
      ) {
        throw new Student500PreparationError("invalid_request");
      }
      const request = {
        action: "save_gs_draft",
        applicationId: input.applicationId,
        baseDraftId: input.baseDraftId,
        edits: input.edits.map((edit) => ({
          sectionKey: edit.sectionKey,
          text: edit.text,
        })),
        projectId: input.projectId,
      };
      const operation = operationStamp({
        actorUserId: input.actorUserId,
        operationId: input.operationId,
        operationType: "student_500_save_gs_draft",
        request,
        resultKind: "student_500_gs_draft",
      });
      const replay = await replayedArtifact({
        actorUserId: input.actorUserId,
        applicationId: input.applicationId,
        operation,
        projectId: input.projectId,
      });
      if (replay) {
        return {
          draft: projectDraftForResponse(
            replay.value as Student500GsDraftRecord,
            await currentReadableFactReferenceIds(input)
          ),
          replayed: true,
        };
      }
      const base = await store.getDraft({
        applicationId: input.applicationId,
        draftId: input.baseDraftId,
        projectId: input.projectId,
      });
      if (!base) {
        throw new Student500PreparationError("draft_not_found");
      }
      const count = await store.countDrafts({
        applicationId: input.applicationId,
      });
      if (count >= STUDENT_500_PREPARATION_MAX_DRAFT_VERSIONS) {
        throw new Student500PreparationError("limit_exceeded");
      }
      const editedSections: readonly Student500GsSection[] =
        normalizeEditedSections({
          edits: input.edits,
          previous: base.sections,
        });
      const state = await composeState(input);
      // A new version may not silently renew source-derived material whose fact
      // authorization or underlying source is no longer current. Such sections are
      // preserved verbatim but demoted to explicit customer-review material, and
      // the new version stops depending on the stale references.
      const liveFactState = new Map(
        state.selected.map((entry) => [
          entry.factReferenceId,
          entry.currentState,
        ])
      );
      const renewed = renewSectionsForNewVersion({
        liveFactState,
        sections: editedSections,
      });
      const sections = renewed.sections;
      const result = await store.insertDraft({
        actorUserId: input.actorUserId,
        applicationId: input.applicationId,
        operation,
        projectId: input.projectId,
        values: {
          contentSha256: draftContentSha256(sections),
          expectedPreviousVersion: base.version,
          inputDigest: state.currentInputDigest,
          origin: "customer_edit",
          sections,
          // The renewed version depends only on references that are currently
          // authorized; demoted sections keep their ids for provenance only.
          sourceFactReferenceIds: state.selected
            .filter(
              (entry) => entry.currentState === "covered_by_authorized_fact"
            )
            .map((entry) => entry.factReferenceId)
            .sort(),
          supersedesDraftId: base.id,
        },
      });
      return {
        draft: projectDraftForResponse(
          result.value,
          await currentReadableFactReferenceIds(input)
        ),
        replayed: result.replayed,
      };
    },

    async createSnapshot(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly applicationId: string;
      readonly operationId: string;
    }) {
      const context = await authorize(input);
      assertWritable(context);
      const application = await requireApplication(input);
      if (application.status === "archived") {
        throw new Student500PreparationError("application_archived");
      }
      const request = {
        action: "create_preparation_snapshot",
        applicationId: input.applicationId,
        projectId: input.projectId,
      };
      const operation = operationStamp({
        actorUserId: input.actorUserId,
        operationId: input.operationId,
        operationType: "student_500_create_preparation_snapshot",
        request,
        resultKind: "student_500_preparation_snapshot",
      });
      const replay = await replayedArtifact({
        actorUserId: input.actorUserId,
        applicationId: input.applicationId,
        operation,
        projectId: input.projectId,
      });
      if (replay) {
        return {
          replayed: true,
          snapshot: projectSnapshotForResponse(
            replay.value as Student500PreparationSnapshotRecord,
            await currentReadableFactReferenceIds(input)
          ),
        };
      }
      const count = await store.countSnapshots({
        applicationId: input.applicationId,
      });
      if (count >= STUDENT_500_PREPARATION_MAX_SNAPSHOT_VERSIONS) {
        throw new Student500PreparationError("limit_exceeded");
      }
      const state = await composeState(input);
      const latestDraft = state.draftViews.at(-1) ?? null;
      const content = {
        applicationRevision: state.application.revision,
        contextDigest: preparationDigest(state.application.context),
        contextSummary: {
          applicationPlace: state.application.context.applicationPlace,
          asOfDate: state.application.context.asOfDate,
          coeStatus: state.application.context.coeStatus,
          entryRoute: state.application.context.entryRoute,
        },
        disclosures: state.reconciliation.disclosures,
        factDigests: state.currentFactDigests,
        factReferenceIds: state.selected.map((entry) => entry.factReferenceId),
        factReferences: state.selected.map((entry) => ({
          coverage: entry.currentState,
          factAssertionId: entry.factAssertionId,
          factKey: entry.factKey,
          factReferenceId: entry.factReferenceId,
          factVersion: entry.factVersion,
          originKind: entry.originKind,
        })),
        gsDraft: latestDraft
          ? {
              draftId: latestDraft.draftId,
              label: latestDraft.label,
              origin: latestDraft.origin,
              version: latestDraft.version,
            }
          : null,
        inputDigest: state.currentInputDigest,
        nextActions: state.reconciliation.nextActions,
        requirementCoverage: state.reconciliation.requirements.map((entry) => ({
          applicability: entry.applicability,
          coverage: entry.coverage,
          gaps: entry.gaps,
          legalSourceVerification: entry.legalSourceVerification,
          requirementKey: entry.requirementKey,
        })),
        schemaVersion: STUDENT_500_PREPARATION_SCHEMA,
        schoolContext: schoolContextSummary(state.schoolContext),
        schoolContextDigest: state.currentSchoolDigest,
        screeningSubmissionStatus: "not_submission_ready" as const,
      };
      const result = await store.insertSnapshot({
        actorUserId: input.actorUserId,
        applicationId: input.applicationId,
        operation,
        projectId: input.projectId,
        values: {
          applicationRevision: state.application.revision,
          content,
          contentSha256: preparationDigest(content),
          gsDraftId: latestDraft?.draftId ?? null,
          inputDigest: state.currentInputDigest,
        },
      });
      return {
        replayed: result.replayed,
        snapshot: projectSnapshotForResponse(
          result.value,
          await currentReadableFactReferenceIds(input)
        ),
      };
    },
  };
}

export type Student500PreparationService = ReturnType<
  typeof createStudent500PreparationService
>;
