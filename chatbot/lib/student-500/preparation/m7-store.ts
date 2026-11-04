// biome-ignore-all lint/suspicious/useAwait: this store implements an async port over synchronous in-memory data; there is nothing to await.
import { Student500PreparationError } from "./contracts";
import type {
  Student500EditorialComment,
  Student500EditorialEdit,
  Student500EditorialReviewRecord,
  Student500EditorialStatus,
  Student500GsProposalRecord,
  Student500ProposalStatus,
} from "./m7-contracts";

/**
 * Phase 13 M7 persistence ports.
 *
 * Two additive row families only:
 *
 *   - a GS revision *proposal* bound to one base draft version and content hash;
 *   - an editorial *review round* bound to one draft version, one explicit consent
 *     hash and typed, bounded feedback.
 *
 * Both are insert-once with deterministic identity, so an idempotent replay resolves
 * to the row that was actually persisted. Only a bounded, server-enforced status
 * transition may ever update an existing row; content is immutable.
 */

export type NewProposalValues = {
  readonly id: string;
  readonly baseDraftId: string;
  readonly baseDraftVersion: number;
  readonly baseDraftContentSha256: string;
  readonly sections: Student500GsProposalRecord["sections"];
  readonly contentSha256: string;
  readonly inputDigest: string;
  readonly composerKind: Student500GsProposalRecord["composerKind"];
  readonly composerCode: string;
  readonly attribution: Student500GsProposalRecord["attribution"];
};

export type NewEditorialReviewValues = {
  readonly id: string;
  readonly reviewRound: number;
  readonly draftId: string;
  readonly draftVersion: number;
  readonly draftContentSha256: string;
  readonly consentCode: string;
  readonly consentSha256: string;
  readonly disclosureScopes: Student500EditorialReviewRecord["disclosureScopes"];
  readonly disclosedFactReferenceIds: readonly string[];
  readonly status: Student500EditorialStatus;
  readonly reviewerUserId: string | null;
  readonly reviewerAuthorityCode: string | null;
  readonly reviewerAssignmentStatus: string;
  readonly reviewerCredentialStatus: "verified" | "unverified" | "unavailable";
  readonly comments: readonly Student500EditorialComment[];
  readonly proposedEdits: readonly Student500EditorialEdit[];
  readonly inputDigest: string;
  readonly requestedByUserId: string;
};

export type Student500DeepPreparationStore = {
  listProposals(input: {
    readonly applicationId: string;
  }): Promise<readonly Student500GsProposalRecord[]>;
  getProposal(input: {
    readonly projectId: string;
    readonly applicationId: string;
    readonly proposalId: string;
  }): Promise<Student500GsProposalRecord | null>;
  /** Insert-once: an existing row with the same deterministic id is returned. */
  insertProposal(input: {
    readonly projectId: string;
    readonly applicationId: string;
    readonly values: NewProposalValues;
    readonly actorUserId: string;
  }): Promise<Student500GsProposalRecord>;
  /**
   * Atomically claim a proposal for acceptance. Exactly one caller wins; a caller
   * that finds an existing claim (including its own retry) resumes recovery.
   */
  claimProposal(input: {
    readonly projectId: string;
    readonly applicationId: string;
    readonly proposalId: string;
    readonly actorUserId: string;
  }): Promise<{
    readonly record: Student500GsProposalRecord;
    readonly claimed: boolean;
  }>;
  decideProposal(input: {
    readonly projectId: string;
    readonly applicationId: string;
    readonly proposalId: string;
    readonly status: Student500ProposalStatus;
    readonly actorUserId: string;
    readonly acceptedDraftId: string | null;
  }): Promise<Student500GsProposalRecord>;
  /** A newer draft version invalidates every still-open proposal it supersedes. */
  supersedeProposalsForApplication(input: {
    readonly applicationId: string;
  }): Promise<number>;

  listEditorialReviews(input: {
    readonly applicationId: string;
  }): Promise<readonly Student500EditorialReviewRecord[]>;
  getEditorialReview(input: {
    readonly projectId: string;
    readonly applicationId: string;
    readonly reviewId: string;
  }): Promise<Student500EditorialReviewRecord | null>;
  insertEditorialReview(input: {
    readonly projectId: string;
    readonly applicationId: string;
    readonly values: NewEditorialReviewValues;
  }): Promise<Student500EditorialReviewRecord>;
  updateEditorialReview(input: {
    readonly projectId: string;
    readonly applicationId: string;
    readonly reviewId: string;
    readonly status: Student500EditorialStatus;
    readonly comments: readonly Student500EditorialComment[];
    readonly proposedEdits: readonly Student500EditorialEdit[];
    readonly reviewerUserId: string | null;
    readonly reviewerAuthorityCode: string | null;
    readonly reviewerAssignmentStatus: string;
    readonly reviewerCredentialStatus:
      | "verified"
      | "unverified"
      | "unavailable";
    readonly customerDecisionCode: string | null;
  }): Promise<Student500EditorialReviewRecord>;
};

/** Server-enforced transition table. Anything else is a state conflict. */
const PROPOSAL_TRANSITIONS: Record<
  Student500ProposalStatus,
  readonly Student500ProposalStatus[]
> = {
  accepted: [],
  // A rejection must win the claim before it can decide anything.
  accepting: ["accepted", "superseded"],
  proposed: ["accepting", "rejected", "superseded"],
  rejected: [],
  superseded: [],
};

const EDITORIAL_TRANSITIONS: Record<
  Student500EditorialStatus,
  readonly Student500EditorialStatus[]
> = {
  accepted_by_customer: [],
  authority_unavailable: [],
  feedback_provided: [
    "accepted_by_customer",
    "rejected_by_customer",
    "superseded",
  ],
  rejected_by_customer: [],
  requested: ["feedback_provided", "authority_unavailable", "superseded"],
  superseded: [],
};

export function assertProposalTransition(
  from: Student500ProposalStatus,
  to: Student500ProposalStatus
): void {
  if (!PROPOSAL_TRANSITIONS[from].includes(to)) {
    throw new Student500PreparationError("state_conflict");
  }
}

export function assertEditorialTransition(
  from: Student500EditorialStatus,
  to: Student500EditorialStatus
): void {
  if (!EDITORIAL_TRANSITIONS[from].includes(to)) {
    throw new Student500PreparationError("state_conflict");
  }
}

/* ------------------------------------------------------------ in-memory store */

/**
 * Offline store used by unit and acceptance tests. It enforces the same transition
 * table and immutability rules as the PostgreSQL implementation, so a test cannot
 * pass against a weaker contract than production.
 */
export function createInMemoryDeepPreparationStore() {
  const proposals = new Map<string, Student500GsProposalRecord>();
  const reviews = new Map<string, Student500EditorialReviewRecord>();
  let clock = 1;

  function now(): Date {
    // Monotonic synthetic clock: deterministic ordering without wall-clock flake.
    clock += 1;
    return new Date(Date.UTC(2026, 10, 4, 0, 0, clock));
  }

  const store: Student500DeepPreparationStore = {
    listProposals({ applicationId }) {
      return Promise.resolve([...proposals.values()]
        .filter((proposal) => proposal.applicationId === applicationId)
        .sort(
          (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
        ));
    },

    async getProposal({ projectId, applicationId, proposalId }) {
      const found = proposals.get(proposalId);
      if (
        !found ||
        found.projectId !== projectId ||
        found.applicationId !== applicationId
      ) {
        return null;
      }
      return found;
    },

    async insertProposal({ projectId, applicationId, values, actorUserId }) {
      const existing = proposals.get(values.id);
      if (existing) {
        if (
          existing.projectId !== projectId ||
          existing.applicationId !== applicationId ||
          existing.contentSha256 !== values.contentSha256
        ) {
          throw new Student500PreparationError("idempotency_conflict");
        }
        return existing;
      }
      const record: Student500GsProposalRecord = {
        acceptedDraftId: null,
        applicationId,
        attribution: values.attribution,
        baseDraftContentSha256: values.baseDraftContentSha256,
        baseDraftId: values.baseDraftId,
        baseDraftVersion: values.baseDraftVersion,
        composerCode: values.composerCode,
        composerKind: values.composerKind,
        contentSha256: values.contentSha256,
        createdAt: now(),
        createdByUserId: actorUserId,
        decidedAt: null,
        decidedByUserId: null,
        id: values.id,
        inputDigest: values.inputDigest,
        projectId,
        sectionCount: values.sections.length,
        sections: values.sections,
        status: "proposed",
      };
      proposals.set(record.id, record);
      return record;
    },

    async claimProposal({ projectId, applicationId, proposalId }) {
      const found = proposals.get(proposalId);
      if (
        !found ||
        found.projectId !== projectId ||
        found.applicationId !== applicationId
      ) {
        throw new Student500PreparationError("proposal_not_found");
      }
      if (found.status === "accepting") {
        return { claimed: false, record: found };
      }
      assertProposalTransition(found.status, "accepting");
      const record: Student500GsProposalRecord = {
        ...found,
        status: "accepting",
      };
      proposals.set(record.id, record);
      return { claimed: true, record };
    },

    async decideProposal({
      projectId,
      applicationId,
      proposalId,
      status,
      actorUserId,
      acceptedDraftId,
    }) {
      const found = proposals.get(proposalId);
      if (
        !found ||
        found.projectId !== projectId ||
        found.applicationId !== applicationId
      ) {
        throw new Student500PreparationError("proposal_not_found");
      }
      assertProposalTransition(found.status, status);
      const record: Student500GsProposalRecord = {
        ...found,
        acceptedDraftId:
          status === "accepted" ? acceptedDraftId : found.acceptedDraftId,
        decidedAt: now(),
        decidedByUserId: actorUserId,
        status,
      };
      proposals.set(record.id, record);
      return record;
    },

    async supersedeProposalsForApplication({ applicationId }) {
      let changed = 0;
      for (const [id, proposal] of proposals) {
        if (
          proposal.applicationId !== applicationId ||
          (proposal.status !== "proposed" && proposal.status !== "accepting")
        ) {
          continue;
        }
        proposals.set(id, { ...proposal, status: "superseded" });
        changed += 1;
      }
      return changed;
    },
    async listEditorialReviews({ applicationId }) {
      return [...reviews.values()]
        .filter((review) => review.applicationId === applicationId)
        .sort((left, right) => left.reviewRound - right.reviewRound);
    },

    async getEditorialReview({ projectId, applicationId, reviewId }) {
      const found = reviews.get(reviewId);
      if (
        !found ||
        found.projectId !== projectId ||
        found.applicationId !== applicationId
      ) {
        return null;
      }
      return found;
    },

    async insertEditorialReview({ projectId, applicationId, values }) {
      // Mirrors unique(applicationId, reviewRound) in migration 0050.
      for (const review of reviews.values()) {
        if (
          review.applicationId === applicationId &&
          review.reviewRound === values.reviewRound &&
          review.id !== values.id
        ) {
          throw new Student500PreparationError("state_conflict");
        }
      }
      const existing = reviews.get(values.id);
      if (existing) {
        if (
          existing.projectId !== projectId ||
          existing.applicationId !== applicationId ||
          existing.consentSha256 !== values.consentSha256
        ) {
          throw new Student500PreparationError("idempotency_conflict");
        }
        return existing;
      }
      const createdAt = now();
      const record: Student500EditorialReviewRecord = {
        applicationId,
        comments: values.comments,
        consentCode: values.consentCode,
        consentSha256: values.consentSha256,
        createdAt,
        customerDecisionCode: null,
        disclosedFactReferenceIds: values.disclosedFactReferenceIds,
        disclosureScopes: values.disclosureScopes,
        draftContentSha256: values.draftContentSha256,
        draftId: values.draftId,
        draftVersion: values.draftVersion,
        id: values.id,
        inputDigest: values.inputDigest,
        professionalSignOff: "not_established",
        projectId,
        proposedEdits: values.proposedEdits,
        requestedByUserId: values.requestedByUserId,
        reviewRound: values.reviewRound,
        reviewerAssignmentStatus: values.reviewerAssignmentStatus,
        reviewerAuthorityCode: values.reviewerAuthorityCode,
        reviewerCredentialStatus: values.reviewerCredentialStatus,
        reviewerUserId: values.reviewerUserId,
        status: values.status,
        updatedAt: createdAt,
      };
      reviews.set(record.id, record);
      return record;
    },

    async updateEditorialReview(input) {
      const found = reviews.get(input.reviewId);
      if (
        !found ||
        found.projectId !== input.projectId ||
        found.applicationId !== input.applicationId
      ) {
        throw new Student500PreparationError("editorial_review_not_found");
      }
      if (found.status !== input.status) {
        assertEditorialTransition(found.status, input.status);
      }
      const record: Student500EditorialReviewRecord = {
        ...found,
        comments: input.comments,
        customerDecisionCode: input.customerDecisionCode,
        proposedEdits: input.proposedEdits,
        reviewerAssignmentStatus: input.reviewerAssignmentStatus,
        reviewerAuthorityCode: input.reviewerAuthorityCode,
        reviewerCredentialStatus: input.reviewerCredentialStatus,
        reviewerUserId: input.reviewerUserId,
        status: input.status,
        updatedAt: now(),
      };
      reviews.set(record.id, record);
      return record;
    },
  };
  return { proposals, reviews, store };
}
