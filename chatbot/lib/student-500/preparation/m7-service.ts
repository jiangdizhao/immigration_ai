import type { ProfessionalCredentialVerifier } from "../../professional-review/authority";
import {
  isStudent500GsSectionKey,
  STUDENT_500_GS_MAX_SECTIONS as M7_MAX_SECTIONS,
  preparationDigest,
  type Student500GsSectionKey,
  Student500PreparationError,
} from "./contracts";
import {
  editorialAuthorityRequestSha256,
  editorialConsentSha256,
  editorialStaleReasons,
  type Student500EditorialAssignmentStatus,
  type Student500EditorialAuthority,
  validateEditorialConsent,
  validateEditorialEdits,
} from "./editorial";
import {
  type Student500GsComposer,
  type Student500GsCompositionFact,
  statementsNeedingConfirmation,
  validateComposition,
} from "./gs-composer";
import {
  deterministicPreparationUuid,
  editorialCommentId,
  STUDENT_500_DEEP_PREPARATION_SCHEMA,
  STUDENT_500_FORBIDDEN_M8_ACTIONS,
  STUDENT_500_MAX_EDITORIAL_COMMENTS,
  STUDENT_500_MAX_EDITORIAL_ROUNDS,
  STUDENT_500_MAX_PROPOSALS,
  STUDENT_500_MAX_TASKS,
  type Student500DeepDisclosure,
  type Student500EditorialComment,
  type Student500EditorialDisclosureScope,
  type Student500EditorialReviewRecord,
  type Student500EditorialStaleReason,
  type Student500FollowUpQuestion,
  type Student500GsProposalRecord,
  type Student500PreparationTask,
  type Student500ScenarioProfile,
  validateEditorialCommentBody,
} from "./m7-contracts";
import type { Student500DeepPreparationStore } from "./m7-store";
import {
  followUpQuestions,
  planPreparationTasks,
  primaryNextAction,
  student500ScenarioProfile,
} from "./scenario";
import type { Student500PreparationService } from "./service";

/**
 * Phase 13 M7 deep-preparation service.
 *
 * Composes over the accepted M6.2 service rather than re-implementing it:
 * authorization, application ownership, fact authorization, requirement coverage,
 * GS versioning, snapshot semantics and legal currentness all stay where they were.
 *
 * M7 adds exactly three write paths - propose a bounded GS revision, record a
 * customer decision on that proposal, and run a consented editorial round - plus a
 * deterministic scenario/task projection. There is no path to submission, approval,
 * professional sign-off or a legal conclusion.
 */

export type EditorialReviewView = {
  readonly reviewId: string;
  readonly reviewRound: number;
  readonly draftId: string;
  readonly draftVersion: number;
  readonly draftContentSha256: string;
  readonly status: Student500EditorialReviewRecord["status"];
  readonly disclosureScopes: readonly Student500EditorialDisclosureScope[];
  readonly disclosedFactReferenceCount: number;
  readonly reviewerUserId: string | null;
  readonly reviewerAuthorityCode: string | null;
  readonly reviewerCredentialStatus: "verified" | "unverified" | "unavailable";
  /** Always `not_established`: editorial feedback is never a legal sign-off. */
  readonly professionalSignOff: "not_established";
  readonly comments: readonly {
    readonly commentId: string;
    readonly sectionKey: string | null;
    readonly body: string;
    readonly proposedText: string | null;
    readonly advisoryOnly: true;
  }[];
  readonly proposedEdits: readonly {
    readonly sectionKey: string;
    readonly proposedText: string;
    readonly rationaleCode: string;
    readonly advisoryOnly: true;
  }[];
  readonly stale: boolean;
  readonly staleReasons: readonly Student500EditorialStaleReason[];
  /** True when feedback text was withheld because disclosure access ended. */
  readonly redacted: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ProposalView = {
  readonly proposalId: string;
  readonly status: Student500GsProposalRecord["status"];
  readonly baseDraftId: string;
  readonly baseDraftVersion: number;
  readonly composerKind: Student500GsProposalRecord["composerKind"];
  readonly composerCode: string;
  readonly contentSha256: string;
  readonly sections: readonly {
    readonly sectionKey: string;
    readonly heading: string;
    readonly text: string;
    readonly missingInformation: readonly string[];
    readonly assertionCount: number;
    readonly unverifiedAssertionCount: number;
  }[];
  readonly attribution: Student500GsProposalRecord["attribution"];
  readonly statementsNeedingConfirmation: readonly {
    readonly sectionKey: string;
    readonly assertionText: string;
  }[];
  readonly acceptedDraftId: string | null;
  readonly createdAt: string;
  /** False when at least one section was withheld for current-access reasons. */
  readonly readable: boolean;
  readonly redactedSectionCount: number;
  /** True when the base draft is no longer the latest draft version. */
  readonly stale: boolean;
};

export type Student500DeepPreparationView = {
  readonly schemaVersion: typeof STUDENT_500_DEEP_PREPARATION_SCHEMA;
  readonly projectId: string;
  readonly applicationId: string;
  readonly scenario: Student500ScenarioProfile;
  readonly tasks: readonly Student500PreparationTask[];
  readonly followUpQuestions: readonly Student500FollowUpQuestion[];
  readonly primaryNextAction: Student500PreparationTask["action"] | null;
  readonly proposal: ProposalView | null;
  readonly proposals: readonly ProposalView[];
  readonly editorialReview: EditorialReviewView | null;
  readonly editorialReviews: readonly EditorialReviewView[];
  readonly editorialAuthority: {
    readonly available: boolean;
    readonly authorityCode: string;
    readonly credentialStatus: "verified" | "unverified" | "unavailable";
  };
  /**
   * The exact current GS draft identity. A review request must name this id, version
   * and content hash; the browser never invents them.
   */
  readonly currentDraft: {
    readonly draftId: string;
    readonly version: number;
    readonly contentSha256: string;
  } | null;
  /**
   * Fact references this actor may currently disclose, and which of them the current
   * draft actually depends on. Used to show the disclosure scope and to refuse a
   * consent that pretends a fact-bearing draft has no protected dependencies.
   */
  readonly disclosureScope: {
    readonly readableFactReferenceIds: readonly string[];
    readonly factBearingDraftReferenceIds: readonly string[];
  };
  readonly submissionStatus: "not_submission_ready";
  readonly submissionActionsAvailable: readonly never[];
  readonly disclosures: readonly Student500DeepDisclosure[];
  readonly limits: {
    readonly maxTasks: number;
    readonly maxProposals: number;
    readonly maxEditorialRounds: number;
    readonly maxSections: number;
  };
};

export type Student500DeepPreparationServiceOptions = {
  readonly preparation: Pick<Student500PreparationService, "get" | "saveDraft">;
  readonly store: Student500DeepPreparationStore;
  readonly composer: Student500GsComposer;
  readonly editorialAuthority: Student500EditorialAuthority;
  readonly credentialVerifier: ProfessionalCredentialVerifier;
  /** Server-derived account role. Informational only; never an authorization. */
  readonly resolveActorRole?: (actorUserId: string) => Promise<string>;
  readonly resolveReviewerAssignment?: (input: {
    readonly actorUserId: string;
    readonly projectId: string;
  }) => Promise<Student500EditorialAssignmentStatus>;
  /**
   * Project-scoped (NOT owner-scoped) current draft identity. A reviewer must never
   * borrow the applicant's read boundary, so staleness for the professional path is
   * resolved through this port and fails closed when it is absent.
   */
  /**
   * Project-scoped confirmation that the disclosed fact references are still
   * readable for this review. Absent, revoked or unavailable means fail closed.
   */
  readonly resolveDisclosedFactAccess?: (input: {
    readonly projectId: string;
    readonly applicationId: string;
    readonly factReferenceIds: readonly string[];
  }) => Promise<"allowed" | "revoked" | "unavailable">;
  readonly resolveDraftIdentity?: (input: {
    readonly projectId: string;
    readonly applicationId: string;
  }) => Promise<{
    readonly draftId: string;
    readonly version: number;
    readonly contentSha256: string;
  } | null>;
};

export type Scope = {
  readonly actorUserId: string;
  readonly projectId: string;
  readonly applicationId: string;
};

function iso(value: Date): string {
  return value.toISOString();
}

function assertScope(scope: Scope): void {
  if (
    typeof scope.actorUserId !== "string" ||
    scope.actorUserId.length === 0 ||
    typeof scope.projectId !== "string" ||
    scope.projectId.length === 0 ||
    typeof scope.applicationId !== "string" ||
    scope.applicationId.length === 0
  ) {
    throw new Student500PreparationError("invalid_request");
  }
}

export function createStudent500DeepPreparationService(
  options: Student500DeepPreparationServiceOptions
) {
  const { preparation, store } = options;

  function allowedFactIds(
    view: Awaited<ReturnType<Student500PreparationService["get"]>>
  ): readonly string[] {
    return view.selectedFacts
      .filter(
        (fact) =>
          fact.currentState === "covered_by_authorized_fact" &&
          fact.aiUseAuthorized &&
          fact.revokedAt === null
      )
      .map((fact) => fact.factReferenceId);
  }

  function compositionFacts(
    view: Awaited<ReturnType<Student500PreparationService["get"]>>
  ): readonly Student500GsCompositionFact[] {
    const allowed = new Set(allowedFactIds(view));
    const displayByAssertion = new Map(
      view.availableFacts.map((fact) => [
        fact.factAssertionId,
        fact.valueDisplay,
      ])
    );
    return view.selectedFacts
      .filter((fact) => allowed.has(fact.factReferenceId))
      .map((fact) => ({
        factKey: fact.factKey,
        factReferenceId: fact.factReferenceId,
        valueDisplay:
          displayByAssertion.get(fact.factAssertionId) ?? fact.factKey,
      }));
  }

  type PreparationView = Awaited<
    ReturnType<Student500PreparationService["get"]>
  >;

  function scenarioInput(view: PreparationView) {
    const usable = view.selectedFacts.filter(
      (fact) => fact.currentState === "covered_by_authorized_fact"
    );
    return {
      factKeys: usable.map((fact) => fact.factKey),
      hasAuthorizedFacts: usable.length > 0,
      requirements: view.reconciliation.requirements.map((requirement) => ({
        requirementKey: requirement.requirementKey,
        status: requirement.applicability,
      })),
      schoolContext: view.schoolContext
        ? {
            kind: view.schoolContext.kind,
            studyEvidenceKind: view.schoolContext.studyEvidenceKind,
          }
        : null,
    };
  }

  /**
   * Safe current view of a stored proposal. Sections whose fact references are no
   * longer readable by this actor are withheld - stored text is never re-rendered
   * when the underlying M2 authorization has been revoked or has become invisible.
   */
  function proposalView(
    record: Student500GsProposalRecord,
    latestDraftId: string | null,
    readableFactIds: ReadonlySet<string>
  ): ProposalView {
    const readableSections = record.sections.filter(
      (section) =>
        section.factReferenceIds.every((id) => readableFactIds.has(id)) &&
        section.assertions.every((assertion) =>
          assertion.factReferenceIds.every((id) => readableFactIds.has(id))
        )
    );
    return {
      acceptedDraftId: record.acceptedDraftId,
      attribution: record.attribution,
      baseDraftId: record.baseDraftId,
      baseDraftVersion: record.baseDraftVersion,
      composerCode: record.composerCode,
      composerKind: record.composerKind,
      contentSha256: record.contentSha256,
      createdAt: iso(record.createdAt),
      proposalId: record.id,
      readable: readableSections.length === record.sections.length,
      redactedSectionCount: record.sections.length - readableSections.length,
      sections: readableSections.map((section) => ({
        assertionCount: section.assertions.length,
        heading: section.heading,
        missingInformation: section.missingInformation,
        sectionKey: section.sectionKey,
        text: section.text,
        unverifiedAssertionCount: section.assertions.filter(
          (assertion) => assertion.support === "unverified_needs_confirmation"
        ).length,
      })),
      stale: latestDraftId === null || record.baseDraftId !== latestDraftId,
      statementsNeedingConfirmation: statementsNeedingConfirmation(
        readableSections
      ).map((statement) => ({
        assertionText: statement.assertionText,
        sectionKey: statement.sectionKey,
      })),
      status: record.status,
    };
  }

  function editorialView(
    record: Student500EditorialReviewRecord,
    staleReasons: readonly Student500EditorialStaleReason[]
  ): EditorialReviewView {
    // Revoked/invisible disclosed facts must not survive in reviewer feedback.
    const withheld = staleReasons.some(
      (reason) =>
        reason === "disclosed_fact_unreadable" || reason === "authority_revoked"
    );
    return {
      redacted: withheld,
      comments: (withheld ? [] : record.comments).map((comment) => ({
        advisoryOnly: true,
        body: comment.body,
        commentId: comment.commentId,
        proposedText: comment.proposedText,
        sectionKey: comment.sectionKey,
      })),
      createdAt: iso(record.createdAt),
      disclosedFactReferenceCount: record.disclosedFactReferenceIds.length,
      disclosureScopes: record.disclosureScopes,
      draftContentSha256: record.draftContentSha256,
      draftId: record.draftId,
      draftVersion: record.draftVersion,
      professionalSignOff: "not_established",
      proposedEdits: (withheld ? [] : record.proposedEdits).map((edit) => ({
        advisoryOnly: true,
        proposedText: edit.proposedText,
        rationaleCode: edit.rationaleCode,
        sectionKey: edit.sectionKey,
      })),
      reviewId: record.id,
      reviewerAuthorityCode: record.reviewerAuthorityCode,
      reviewerCredentialStatus: record.reviewerCredentialStatus,
      reviewerUserId: record.reviewerUserId,
      reviewRound: record.reviewRound,
      stale: staleReasons.length > 0,
      staleReasons,
      status: record.status,
      updatedAt: iso(record.updatedAt),
    };
  }

  async function authorityDecision(input: {
    readonly action: Parameters<
      Student500EditorialAuthority["decide"]
    >[0]["action"];
    readonly scope: Scope;
    readonly draftId: string;
    readonly draftVersion: number;
    readonly draftContentSha256: string;
    readonly reviewId: string | null;
  }) {
    const actorRole = options.resolveActorRole
      ? await options.resolveActorRole(input.scope.actorUserId)
      : "authenticated_user";
    const assignmentStatus = options.resolveReviewerAssignment
      ? await options.resolveReviewerAssignment({
          actorUserId: input.scope.actorUserId,
          projectId: input.scope.projectId,
        })
      : "unavailable";
    const requestSha256 = editorialAuthorityRequestSha256({
      action: input.action,
      actorUserId: input.scope.actorUserId,
      applicationId: input.scope.applicationId,
      draftContentSha256: input.draftContentSha256,
      draftId: input.draftId,
      draftVersion: input.draftVersion,
      projectId: input.scope.projectId,
      reviewId: input.reviewId,
      reviewerAssignmentStatus: assignmentStatus,
    });
    return {
      assignmentStatus,
      decision: options.editorialAuthority.decide({
        action: input.action,
        actorRole,
        actorUserId: input.scope.actorUserId,
        applicationId: input.scope.applicationId,
        draftContentSha256: input.draftContentSha256,
        draftId: input.draftId,
        draftVersion: input.draftVersion,
        projectId: input.scope.projectId,
        requestSha256,
        reviewId: input.reviewId,
        reviewerAssignmentStatus: assignmentStatus,
      }),
    };
  }

  function credentialStatus(scope: Scope, draftId: string) {
    const result = options.credentialVerifier.verify({
      actorUserId: scope.actorUserId,
      projectId: scope.projectId,
      targetId: draftId,
      targetKind: "student500_gs_draft",
    });
    return result.status;
  }

  /**
   * Fact references this actor may currently read.
   *
   * This reproduces the accepted M6.2 disclosure rule exactly
   * (`readableFactReferenceIdSet`): a reference must be active AND its underlying
   * Fact Assertion must still be visible in the current actor's M2 projection. A
   * sharing revocation therefore withdraws derived M7 text even though the
   * Student500FactReference row itself is untouched. Checking only
   * `revokedAt === null` was the R2 leakage defect.
   */
  function readableFactIds(view: PreparationView): readonly string[] {
    const visibleAssertionIds = new Set(
      view.availableFacts.map((fact) => fact.factAssertionId)
    );
    return view.selectedFacts
      .filter(
        (fact) =>
          fact.revokedAt === null &&
          visibleAssertionIds.has(fact.factAssertionId)
      )
      .map((fact) => fact.factReferenceId);
  }

  function staleReasonsForReview(input: {
    readonly review: Student500EditorialReviewRecord;
    readonly view: PreparationView;
    readonly authorityAvailable: boolean;
  }): readonly Student500EditorialStaleReason[] {
    return editorialStaleReasons({
      authorityAllowed: input.authorityAvailable,
      currentDraftContentSha256: input.view.latestDraft?.contentSha256 ?? null,
      currentDraftId: input.view.latestDraft?.draftId ?? null,
      readableFactReferenceIds: readableFactIds(input.view),
      review: input.review,
    });
  }

  async function get(scope: Scope): Promise<Student500DeepPreparationView> {
    assertScope(scope);
    const view = await preparation.get({ ...scope });
    const [proposals, reviews] = await Promise.all([
      store.listProposals({ applicationId: scope.applicationId }),
      store.listEditorialReviews({ applicationId: scope.applicationId }),
    ]);

    const scenario = student500ScenarioProfile(scenarioInput(view));
    const tasks = planPreparationTasks({
      ...scenarioInput(view),
      editorialAuthorityAvailable:
        options.editorialAuthority.code !==
        "deny_by_default_student500_editorial_authority",
      editorialReviewRequested: reviews.some(
        (review) => review.status === "authority_unavailable"
      ),
      latestDraft: view.latestDraft
        ? {
            sections: view.latestDraft.sections,
          }
        : null,
      reconciliation: view.reconciliation,
    } as never);

    const credential = credentialStatus(scope, view.latestDraft?.draftId ?? "");
    const authorityAvailable =
      options.editorialAuthority.code !==
        "deny_by_default_student500_editorial_authority" &&
      credential === "verified";

    const reviewViews = await Promise.all(
      reviews.map(async (review) =>
        editorialView(
          review,
          staleReasonsForReview({
            authorityAvailable,
            review,
            view,
          })
        )
      )
    );
    const readable = [...new Set(readableFactIds(view))];
    const readableSet = new Set(readable);
    const proposalViews = proposals.map((proposal) =>
      proposalView(proposal, view.latestDraft?.draftId ?? null, readableSet)
    );

    const draftReferenceIds = new Set(
      (view.latestDraft?.sections ?? []).flatMap(
        (section) => section.factReferenceIds
      )
    );

    return {
      applicationId: scope.applicationId,
      currentDraft: view.latestDraft
        ? {
            contentSha256: view.latestDraft.contentSha256,
            draftId: view.latestDraft.draftId,
            version: view.latestDraft.version,
          }
        : null,
      disclosureScope: {
        factBearingDraftReferenceIds: readable.filter((id) =>
          draftReferenceIds.has(id)
        ),
        readableFactReferenceIds: readable,
      },
      disclosures: scenario.disclosureCodes,
      editorialAuthority: {
        authorityCode: options.editorialAuthority.code,
        available: authorityAvailable,
        credentialStatus: credential,
      },
      editorialReview: reviewViews.at(-1) ?? null,
      editorialReviews: reviewViews,
      followUpQuestions: followUpQuestions(tasks),
      limits: {
        maxEditorialRounds: STUDENT_500_MAX_EDITORIAL_ROUNDS,
        maxProposals: STUDENT_500_MAX_PROPOSALS,
        maxSections: M7_MAX_SECTIONS,
        maxTasks: STUDENT_500_MAX_TASKS,
      },
      primaryNextAction: primaryNextAction(tasks),
      projectId: scope.projectId,
      proposal: proposalViews.at(-1) ?? null,
      proposals: proposalViews,
      scenario,
      schemaVersion: STUDENT_500_DEEP_PREPARATION_SCHEMA,
      submissionActionsAvailable: [],
      submissionStatus: "not_submission_ready",
      tasks,
    };
  }

  async function proposeRevision(scope: Scope): Promise<{
    readonly proposal: ProposalView;
    readonly replayed: boolean;
  }> {
    assertScope(scope);
    const view = await preparation.get({ ...scope });
    const draft = view.latestDraft;
    if (!draft) {
      throw new Student500PreparationError("draft_not_found");
    }
    const existing = await store.listProposals({
      applicationId: scope.applicationId,
    });
    if (
      existing.filter((proposal) => proposal.status === "proposed").length >=
      STUDENT_500_MAX_PROPOSALS
    ) {
      throw new Student500PreparationError("limit_exceeded");
    }

    const facts = compositionFacts(view);
    const allowed = facts.map((fact) => fact.factReferenceId);
    const composition = await options.composer.compose({
      applicationId: scope.applicationId,
      baseDraft: {
        contentSha256: draft.contentSha256,
        draftId: draft.draftId,
        sections: draft.sections.map((section) => ({
          factReferenceIds: section.factReferenceIds,
          heading: section.heading,
          missingInformation: section.missingInformation,
          sectionKey: section.sectionKey as Student500GsSectionKey,
          source: section.source,
          text: section.text,
        })),
        version: draft.version,
      },
      facts,
      tasks: [],
    });
    // Any composer output - deterministic or model - is validated before storage.
    const validated = validateComposition({
      allowedFactReferenceIds: allowed,
      sections: composition.sections.slice(0, M7_MAX_SECTIONS),
    });
    const contentSha256 = preparationDigest(validated.sections);
    const proposalId = deterministicPreparationUuid({
      applicationId: scope.applicationId,
      baseDraftContentSha256: draft.contentSha256,
      baseDraftId: draft.draftId,
      composerCode: composition.composerCode,
      contentSha256,
    });
    const stored = await store.insertProposal({
      actorUserId: scope.actorUserId,
      applicationId: scope.applicationId,
      projectId: scope.projectId,
      values: {
        attribution: validated.attribution,
        baseDraftContentSha256: draft.contentSha256,
        baseDraftId: draft.draftId,
        baseDraftVersion: draft.version,
        composerCode: composition.composerCode,
        composerKind: composition.composerKind,
        contentSha256,
        id: proposalId,
        inputDigest: preparationDigest({
          allowedFactReferenceIds: [...allowed].sort(),
          baseDraftId: draft.draftId,
          baseDraftVersion: draft.version,
        }),
        sections: validated.sections,
      },
    });
    return {
      proposal: proposalView(stored, draft.draftId, new Set(allowed)),
      replayed: existing.some((proposal) => proposal.id === stored.id),
    };
  }

  /**
   * Explicit idempotent acceptance protocol.
   *
   * A draft write and a proposal decision cannot share one database transaction
   * (they live in different M6 tables and the draft path is itself an M6 service
   * call). The protocol therefore makes every step replayable instead:
   *
   *   1. the M6 draft-save operation id is derived deterministically from the
   *      proposal id, so a retry replays the same draft version instead of creating
   *      a second one;
   *   2. an already-accepted proposal is returned as-is (exact replay);
   *   3. if the decision loses a concurrency race, the stored row is re-read and a
   *      same-draft acceptance is treated as success rather than as a duplicate.
   */
  /**
   * Proposal decision protocol.
   *
   * Accepting is a two-phase, claim-first protocol, because the M6 draft write and
   * the proposal decision cannot share one transaction:
   *
   *   1. `proposed -> accepting` is an atomic conditional claim, so only one accept
   *      caller can ever proceed to write a draft;
   *   2. a concurrent reject therefore either wins first (and the accept caller sees
   *      a decided proposal and stops) or loses (and is refused while the claim is
   *      held), so a saved draft and a contradicting decision cannot both exist;
   *   3. the draft write uses a deterministic per-proposal operation id, so an
   *      interruption between the draft write and the final decision is recovered by
   *      replaying the same call: the same draft is returned and the claim is
   *      finalised rather than duplicated.
   */
  async function decideProposal(input: {
    readonly scope: Scope;
    readonly proposalId: string;
    readonly decision: "accept" | "reject";
    readonly operationId?: string;
  }): Promise<{
    readonly proposal: ProposalView;
    readonly draftId: string | null;
    readonly replayed: boolean;
  }> {
    assertScope(input.scope);
    const view = await preparation.get({ ...input.scope });
    const readable = new Set(readableFactIds(view));
    const proposal = await store.getProposal({
      applicationId: input.scope.applicationId,
      projectId: input.scope.projectId,
      proposalId: input.proposalId,
    });
    if (!proposal) {
      throw new Student500PreparationError("proposal_not_found");
    }

    if (input.decision === "reject") {
      // A claim or any terminal state refuses the reversal; only `proposed` can be
      // rejected, and that decision is atomic in the store.
      if (proposal.status !== "proposed") {
        throw new Student500PreparationError("state_conflict");
      }
      const rejected = await store.decideProposal({
        acceptedDraftId: null,
        actorUserId: input.scope.actorUserId,
        applicationId: input.scope.applicationId,
        projectId: input.scope.projectId,
        proposalId: proposal.id,
        status: "rejected",
      });
      return {
        draftId: null,
        proposal: proposalView(
          rejected,
          view.latestDraft?.draftId ?? null,
          readable
        ),
        replayed: false,
      };
    }

    if (proposal.status === "accepted") {
      return {
        draftId: proposal.acceptedDraftId,
        proposal: proposalView(proposal, null, readable),
        replayed: true,
      };
    }
    if (proposal.status === "rejected" || proposal.status === "superseded") {
      throw new Student500PreparationError("state_conflict");
    }

    const draft = view.latestDraft;
    if (!draft || proposal.baseDraftId !== draft.draftId) {
      // Never apply a proposal to a draft version it was not built on.
      throw new Student500PreparationError("state_conflict");
    }

    const claim =
      proposal.status === "accepting"
        ? { claimed: false, record: proposal }
        : await store.claimProposal({
            applicationId: input.scope.applicationId,
            actorUserId: input.scope.actorUserId,
            projectId: input.scope.projectId,
            proposalId: proposal.id,
          });

    // Deterministic per-proposal operation identity: every retry replays one draft.
    const operationId = `m7accept.${proposal.id}`;
    const saved = await preparation.saveDraft({
      actorUserId: input.scope.actorUserId,
      applicationId: input.scope.applicationId,
      baseDraftId: draft.draftId,
      edits: claim.record.sections.map((section) => ({
        sectionKey: section.sectionKey,
        text: section.text,
      })),
      operationId,
      projectId: input.scope.projectId,
    });
    const newDraftId = saved.draft.id;

    let accepted: Student500GsProposalRecord;
    try {
      accepted = await store.decideProposal({
        acceptedDraftId: newDraftId,
        actorUserId: input.scope.actorUserId,
        applicationId: input.scope.applicationId,
        projectId: input.scope.projectId,
        proposalId: proposal.id,
        status: "accepted",
      });
    } catch (error) {
      // Recovery: a concurrent accept may have finalised the same draft first.
      const current = await store.getProposal({
        applicationId: input.scope.applicationId,
        projectId: input.scope.projectId,
        proposalId: proposal.id,
      });
      if (
        current?.status === "accepted" &&
        current.acceptedDraftId === newDraftId
      ) {
        return {
          draftId: newDraftId,
          proposal: proposalView(current, newDraftId, readable),
          replayed: true,
        };
      }
      throw error;
    }
    await store.supersedeProposalsForApplication({
      applicationId: input.scope.applicationId,
    });
    return {
      draftId: newDraftId,
      proposal: proposalView(accepted, newDraftId, readable),
      replayed: claim.claimed === false || saved.replayed === true,
    };
  }

  async function requestEditorialReview(input: {
    readonly scope: Scope;
    readonly consent: {
      readonly draftId: unknown;
      readonly draftVersion: unknown;
      readonly draftContentSha256: unknown;
      readonly disclosureScopes: unknown;
      readonly factReferenceIds: unknown;
      readonly consentGranted: unknown;
      readonly consentCode: unknown;
    };
  }): Promise<{
    readonly review: EditorialReviewView;
    readonly replayed: boolean;
  }> {
    assertScope(input.scope);
    const view = await preparation.get({ ...input.scope });
    const draft = view.latestDraft;
    if (!draft) {
      throw new Student500PreparationError("draft_not_found");
    }
    // The exact content hash is bound from the current draft, never from a caller.
    const consent = validateEditorialConsent({
      ...input.consent,
      draftContentSha256: draft.contentSha256,
    });
    if (
      consent.draftId !== draft.draftId ||
      consent.draftVersion !== draft.version ||
      consent.draftContentSha256 !== draft.contentSha256
    ) {
      // Consent must name the exact current version and content.
      throw new Student500PreparationError("state_conflict");
    }
    const readable = new Set(readableFactIds(view));
    for (const factReferenceId of consent.factReferenceIds) {
      if (!readable.has(factReferenceId)) {
        // Disclosing a fact the customer may not currently read is impossible.
        throw new Student500PreparationError("consent_required");
      }
    }
    // A fact-bearing draft has protected dependencies. An empty selection can never
    // be treated as proof that there is nothing to disclose, and asking for fact
    // summaries requires disclosing every dependency the draft actually rests on.
    const draftDependencies = [
      ...new Set(
        (view.latestDraft?.sections ?? []).flatMap(
          (section) => section.factReferenceIds
        )
      ),
    ].filter((factReferenceId) => readable.has(factReferenceId));
    if (draftDependencies.length > 0 && consent.factReferenceIds.length === 0) {
      throw new Student500PreparationError("consent_required");
    }
    if (consent.disclosureScopes.includes("selected_fact_summaries")) {
      const disclosed = new Set(consent.factReferenceIds);
      if (!draftDependencies.every((id) => disclosed.has(id))) {
        throw new Student500PreparationError("consent_required");
      }
    }

    const reviews = await store.listEditorialReviews({
      applicationId: input.scope.applicationId,
    });
    const consentSha256 = editorialConsentSha256(consent);

    // One logical request = one review round: the identity is the exact draft plus
    // the exact consent by this applicant. A retry therefore resolves the request
    // that already exists instead of adding a round.
    const logicalRequestSha256 = preparationDigest({
      applicationId: input.scope.applicationId,
      consentSha256,
      draftId: draft.draftId,
      requestedByUserId: input.scope.actorUserId,
    });
    const logicalRequestId = deterministicPreparationUuid({
      logicalRequestSha256,
    });
    const existingRequest = reviews.find(
      (review) => review.id === logicalRequestId
    );
    if (existingRequest) {
      return {
        replayed: true,
        review: editorialView(
          existingRequest,
          staleReasonsForReview({
            authorityAvailable: false,
            review: existingRequest,
            view,
          })
        ),
      };
    }
    if (reviews.length >= STUDENT_500_MAX_EDITORIAL_ROUNDS) {
      throw new Student500PreparationError("limit_exceeded");
    }
    const { assignmentStatus, decision } = await authorityDecision({
      action: "request_editorial_review",
      draftContentSha256: draft.contentSha256,
      draftId: draft.draftId,
      draftVersion: draft.version,
      reviewId: null,
      scope: input.scope,
    });
    const credential = credentialStatus(input.scope, draft.draftId);
    const targetDraft = draft;
    const reviewId = logicalRequestId;
    const baseRound = (reviews.at(-1)?.reviewRound ?? 0) + 1;

    function insertRound(round: number) {
      return store.insertEditorialReview({
        applicationId: input.scope.applicationId,
        projectId: input.scope.projectId,
        values: {
          comments: [],
          consentCode: consent.consentCode,
          consentSha256,
          disclosedFactReferenceIds: consent.factReferenceIds,
          disclosureScopes: consent.disclosureScopes,
          draftContentSha256: targetDraft.contentSha256,
          draftId: targetDraft.draftId,
          draftVersion: targetDraft.version,
          id: reviewId,
          inputDigest: preparationDigest({
            consentSha256,
            draftContentSha256: targetDraft.contentSha256,
            draftId: targetDraft.draftId,
            requestedByUserId: input.scope.actorUserId,
          }),
          proposedEdits: [],
          requestedByUserId: input.scope.actorUserId,
          reviewRound: round,
          reviewerAssignmentStatus: assignmentStatus,
          reviewerAuthorityCode: decision.allowed
            ? decision.authorityCode
            : (decision.reasonCode ?? null),
          reviewerCredentialStatus: credential,
          reviewerUserId: null,
          status: decision.allowed ? "requested" : "authority_unavailable",
        },
      });
    }

    const stored = await insertRound(baseRound).catch(async (error) => {
      // A concurrent request may have taken this round number. Re-read once: the
      // same logical request resolves to itself, a different one takes the next
      // free round explicitly instead of silently colliding.
      const current = await store.listEditorialReviews({
        applicationId: input.scope.applicationId,
      });
      const same = current.find((review) => review.id === reviewId);
      if (same) {
        return same;
      }
      if (current.length >= STUDENT_500_MAX_EDITORIAL_ROUNDS) {
        throw error;
      }
      return insertRound((current.at(-1)?.reviewRound ?? 0) + 1);
    });

    return {
      replayed: reviews.some((review) => review.id === stored.id),
      review: editorialView(stored, []),
    };
  }

  /**
   * Professional feedback path.
   *
   * Every precondition is enforced before anything is persisted, and the reviewer
   * never borrows the applicant's owner-scoped read boundary:
   *
   *   1. exact draft/version/content identity must still be current;
   *   2. a scoped editorial authority decision must allow the action;
   *   3. an independently verified professional credential is required - a positive
   *      authority decision alone is never enough;
   *   4. the disclosed fact scope must still be readable for this review;
   *   5. only then is feedback written, with `professionalSignOff` still
   *      `not_established`.
   */
  async function submitEditorialFeedback(input: {
    readonly scope: Scope;
    readonly reviewId: string;
    readonly comments: readonly unknown[];
    readonly proposedEdits: readonly unknown[];
  }): Promise<{ readonly review: EditorialReviewView }> {
    assertScope(input.scope);
    const review = await store.getEditorialReview({
      applicationId: input.scope.applicationId,
      projectId: input.scope.projectId,
      reviewId: input.reviewId,
    });
    if (!review) {
      throw new Student500PreparationError("editorial_review_not_found");
    }
    if (review.status !== "requested") {
      throw new Student500PreparationError("state_conflict");
    }
    const target = review;

    async function persistUnavailable(reasonCode: string): Promise<void> {
      await store.updateEditorialReview({
        applicationId: input.scope.applicationId,
        comments: target.comments,
        customerDecisionCode: null,
        projectId: input.scope.projectId,
        proposedEdits: target.proposedEdits,
        reviewId: target.id,
        reviewerAssignmentStatus: "unavailable",
        reviewerAuthorityCode: reasonCode,
        reviewerCredentialStatus: "unavailable",
        reviewerUserId: null,
        status: "authority_unavailable",
      });
    }

    // 1. exact target identity, resolved project-scoped (never owner-scoped).
    const readDraftIdentity = options.resolveDraftIdentity;
    if (!readDraftIdentity) {
      await persistUnavailable("draft_identity_unavailable");

      throw new Student500PreparationError("editorial_authority_unavailable");
    }
    const currentDraft = await readDraftIdentity({
      applicationId: input.scope.applicationId,
      projectId: input.scope.projectId,
    });
    if (
      !currentDraft ||
      currentDraft.draftId !== review.draftId ||
      currentDraft.version !== review.draftVersion ||
      currentDraft.contentSha256 !== review.draftContentSha256
    ) {
      await store.updateEditorialReview({
        applicationId: input.scope.applicationId,
        comments: target.comments,
        customerDecisionCode: "superseded",
        projectId: input.scope.projectId,
        proposedEdits: target.proposedEdits,
        reviewId: target.id,
        reviewerAssignmentStatus: review.reviewerAssignmentStatus,
        reviewerAuthorityCode: review.reviewerAuthorityCode,
        reviewerCredentialStatus: review.reviewerCredentialStatus,
        reviewerUserId: review.reviewerUserId,
        status: "superseded",
      });
      throw new Student500PreparationError("state_conflict");
    }

    // 2. scoped authority decision.
    const { assignmentStatus, decision } = await authorityDecision({
      action: "submit_editorial_feedback",
      draftContentSha256: review.draftContentSha256,
      draftId: review.draftId,
      draftVersion: review.draftVersion,
      reviewId: target.id,
      scope: input.scope,
    });
    if (!decision.allowed) {
      await persistUnavailable(decision.reasonCode);
      throw new Student500PreparationError("editorial_authority_unavailable");
    }

    // 3. independent credential verification - authority alone is insufficient.
    const credential = options.credentialVerifier.verify({
      actorUserId: input.scope.actorUserId,
      projectId: input.scope.projectId,
      targetId: review.draftId,
      targetKind: "student500_gs_draft",
    });
    if (credential.status !== "verified") {
      await persistUnavailable("professional_credential_unverified");

      throw new Student500PreparationError("editorial_authority_unavailable");
    }

    // 4. consent scope must still be readable.
    const readDisclosureAccess = options.resolveDisclosedFactAccess;
    if (!readDisclosureAccess) {
      await persistUnavailable("disclosure_authorization_unavailable");

      throw new Student500PreparationError("editorial_authority_unavailable");
    }
    const access = await readDisclosureAccess({
      applicationId: input.scope.applicationId,
      factReferenceIds: review.disclosedFactReferenceIds,
      projectId: input.scope.projectId,
    });
    if (access !== "allowed") {
      await persistUnavailable(`disclosure_${access}`);
      throw new Student500PreparationError("editorial_authority_unavailable");
    }

    // 5. persist bounded feedback.
    if (input.comments.length > STUDENT_500_MAX_EDITORIAL_COMMENTS) {
      throw new Student500PreparationError("limit_exceeded");
    }
    const comments: Student500EditorialComment[] = input.comments.map(
      (entry, ordinal) => {
        if (typeof entry !== "object" || entry === null) {
          throw new Student500PreparationError("invalid_request");
        }
        const record = entry as Record<string, unknown>;
        const body = validateEditorialCommentBody(record.body);
        return {
          authorUserId: input.scope.actorUserId,
          body,
          commentId: editorialCommentId({
            body,
            ordinal: ordinal + 1,
            reviewId: target.id,
          }),
          createdAt: new Date(),
          proposedText:
            record.proposedText === undefined || record.proposedText === null
              ? null
              : validateEditorialCommentBody(record.proposedText),
          sectionKey: isStudent500GsSectionKey(record.sectionKey)
            ? record.sectionKey
            : null,
        };
      }
    );
    const proposedEdits = validateEditorialEdits(input.proposedEdits);
    const updated = await store.updateEditorialReview({
      applicationId: input.scope.applicationId,
      comments,
      customerDecisionCode: null,
      projectId: input.scope.projectId,
      proposedEdits,
      reviewId: target.id,
      reviewerAssignmentStatus: assignmentStatus,
      reviewerAuthorityCode: decision.authorityCode,
      reviewerCredentialStatus: credential.status,
      reviewerUserId: input.scope.actorUserId,
      status: "feedback_provided",
    });
    return { review: editorialView(updated, []) };
  }

  async function decideEditorialReview(input: {
    readonly scope: Scope;
    readonly reviewId: string;
    readonly decision: "accept" | "reject";
    readonly operationId?: string;
  }): Promise<{
    readonly review: EditorialReviewView;
    readonly draftId: string | null;
  }> {
    assertScope(input.scope);
    const review = await store.getEditorialReview({
      applicationId: input.scope.applicationId,
      projectId: input.scope.projectId,
      reviewId: input.reviewId,
    });
    if (!review) {
      throw new Student500PreparationError("editorial_review_not_found");
    }
    if (review.status !== "feedback_provided") {
      throw new Student500PreparationError("state_conflict");
    }
    const view = await preparation.get({ ...input.scope });
    const staleReasons = staleReasonsForReview({
      authorityAvailable: true,
      review,
      view,
    });
    if (staleReasons.length > 0) {
      // A stale round can never be applied: mark it superseded and stop.
      const superseded = await store.updateEditorialReview({
        applicationId: input.scope.applicationId,
        comments: review.comments,
        customerDecisionCode: "superseded",
        projectId: input.scope.projectId,
        proposedEdits: review.proposedEdits,
        reviewId: review.id,
        reviewerAssignmentStatus: review.reviewerAssignmentStatus,
        reviewerAuthorityCode: review.reviewerAuthorityCode,
        reviewerCredentialStatus: review.reviewerCredentialStatus,
        reviewerUserId: review.reviewerUserId,
        status: "superseded",
      });
      return {
        draftId: null,
        review: editorialView(superseded, staleReasons),
      };
    }

    if (input.decision === "reject") {
      const rejected = await store.updateEditorialReview({
        applicationId: input.scope.applicationId,
        comments: review.comments,
        customerDecisionCode: "customer_rejected",
        projectId: input.scope.projectId,
        proposedEdits: review.proposedEdits,
        reviewId: review.id,
        reviewerAssignmentStatus: review.reviewerAssignmentStatus,
        reviewerAuthorityCode: review.reviewerAuthorityCode,
        reviewerCredentialStatus: review.reviewerCredentialStatus,
        reviewerUserId: review.reviewerUserId,
        status: "rejected_by_customer",
      });
      return { draftId: null, review: editorialView(rejected, []) };
    }

    const draft = view.latestDraft;
    if (!draft || draft.draftId !== review.draftId) {
      throw new Student500PreparationError("state_conflict");
    }
    if (review.proposedEdits.length === 0) {
      throw new Student500PreparationError("state_conflict");
    }
    // The customer accepts specific edits; the accepted text is theirs, and it
    // becomes a new immutable draft version through the accepted M6 path.
    const saved = await preparation.saveDraft({
      actorUserId: input.scope.actorUserId,
      applicationId: input.scope.applicationId,
      baseDraftId: draft.draftId,
      edits: review.proposedEdits.map((edit) => ({
        sectionKey: edit.sectionKey,
        text: edit.proposedText,
      })),
      operationId: `m7edit.${review.id}`,
      projectId: input.scope.projectId,
    });
    const accepted = await store.updateEditorialReview({
      applicationId: input.scope.applicationId,
      comments: review.comments,
      customerDecisionCode: "customer_accepted",
      projectId: input.scope.projectId,
      proposedEdits: review.proposedEdits,
      reviewId: review.id,
      reviewerAssignmentStatus: review.reviewerAssignmentStatus,
      reviewerAuthorityCode: review.reviewerAuthorityCode,
      reviewerCredentialStatus: review.reviewerCredentialStatus,
      reviewerUserId: review.reviewerUserId,
      status: "accepted_by_customer",
    });
    return {
      draftId: saved.draft.id,
      review: editorialView(accepted, []),
    };
  }

  return {
    decideEditorialReview,
    decideProposal,
    forbiddenSubmissionActions: STUDENT_500_FORBIDDEN_M8_ACTIONS,
    get,
    proposeRevision,
    requestEditorialReview,
    submitEditorialFeedback,
  };
}

export type Student500DeepPreparationService = ReturnType<
  typeof createStudent500DeepPreparationService
>;
