import "server-only";

import { sql } from "drizzle-orm";
import { getLazyDatabase } from "@/lib/db/runtime-client";
import { Student500PreparationError } from "./contracts";
import type {
  Student500EditorialReviewRecord,
  Student500GsProposalRecord,
} from "./m7-contracts";
import {
  assertEditorialTransition,
  assertProposalTransition,
  type NewEditorialReviewValues,
  type NewProposalValues,
  type Student500DeepPreparationStore,
} from "./m7-store";

/**
 * Phase 13 M7 PostgreSQL store.
 *
 * Database-owned invariants (migration 0050):
 *   - `unique (applicationId, contentSha256)` makes a repeated proposal an
 *     insert-once replay rather than a duplicate;
 *   - `unique (applicationId, reviewRound)` bounds and serializes review rounds;
 *   - `unique (projectId, id)` keeps every lookup Project-scoped;
 *   - the 0050 triggers keep identity, consent, target, sections and all evidence
 *     hashes immutable, forbid deletes, and refuse any status transition other than
 *     the accepted forward set.
 *
 * Every read is additionally filtered by Project and application, so a
 * Project-member never sees another member's proposal or editorial round.
 */

const db = () => getLazyDatabase();

/**
 * Query runner seam.
 *
 * Production always uses the lazy PostgreSQL client. Tests inject a runner so the
 * actual SQL and row handling of this repository can be exercised offline, without a
 * database and without reimplementing the contract elsewhere.
 */
export type DeepPreparationQueryRunner = (query: unknown) => Promise<unknown[]>;

const defaultRunner: DeepPreparationQueryRunner = async (query) =>
  (await db().execute(query as never)) as unknown as unknown[];

type ProposalRow = {
  id: string;
  projectId: string;
  applicationId: string;
  baseDraftId: string;
  baseDraftVersion: number;
  baseDraftContentSha256: string;
  sections: unknown;
  contentSha256: string;
  inputDigest: string;
  status: string;
  composerKind: string;
  composerCode: string;
  attribution: unknown;
  createdByUserId: string;
  createdAt: Date | string;
  decidedByUserId: string | null;
  decidedAt: Date | string | null;
  acceptedDraftId: string | null;
};

type ReviewRow = {
  id: string;
  projectId: string;
  applicationId: string;
  reviewRound: number;
  draftId: string;
  draftVersion: number;
  draftContentSha256: string;
  consentCode: string;
  consentSha256: string;
  disclosureScopes: unknown;
  disclosedFactReferenceIds: unknown;
  status: string;
  reviewerUserId: string | null;
  reviewerAuthorityCode: string | null;
  reviewerAssignmentStatus: string;
  reviewerCredentialStatus: string;
  comments: unknown;
  proposedEdits: unknown;
  inputDigest: string;
  requestedByUserId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  customerDecisionCode: string | null;
};

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function mapProposal(row: ProposalRow): Student500GsProposalRecord {
  return {
    acceptedDraftId: row.acceptedDraftId,
    applicationId: row.applicationId,
    attribution: row.attribution as Student500GsProposalRecord["attribution"],
    baseDraftContentSha256: row.baseDraftContentSha256,
    baseDraftId: row.baseDraftId,
    baseDraftVersion: row.baseDraftVersion,
    composerCode: row.composerCode,
    composerKind:
      row.composerKind as Student500GsProposalRecord["composerKind"],
    contentSha256: row.contentSha256,
    createdAt: toDate(row.createdAt),
    createdByUserId: row.createdByUserId,
    decidedAt: row.decidedAt === null ? null : toDate(row.decidedAt),
    decidedByUserId: row.decidedByUserId,
    id: row.id,
    inputDigest: row.inputDigest,
    projectId: row.projectId,
    sectionCount: Array.isArray(row.sections) ? row.sections.length : 0,
    sections: row.sections as Student500GsProposalRecord["sections"],
    status: row.status as Student500GsProposalRecord["status"],
  };
}

function mapReview(row: ReviewRow): Student500EditorialReviewRecord {
  return {
    applicationId: row.applicationId,
    comments: row.comments as Student500EditorialReviewRecord["comments"],
    consentCode: row.consentCode,
    consentSha256: row.consentSha256,
    createdAt: toDate(row.createdAt),
    customerDecisionCode: row.customerDecisionCode,
    disclosedFactReferenceIds:
      row.disclosedFactReferenceIds as readonly string[],
    disclosureScopes:
      row.disclosureScopes as Student500EditorialReviewRecord["disclosureScopes"],
    draftContentSha256: row.draftContentSha256,
    draftId: row.draftId,
    draftVersion: row.draftVersion,
    id: row.id,
    inputDigest: row.inputDigest,
    professionalSignOff: "not_established",
    projectId: row.projectId,
    proposedEdits:
      row.proposedEdits as Student500EditorialReviewRecord["proposedEdits"],
    requestedByUserId: row.requestedByUserId,
    reviewRound: row.reviewRound,
    reviewerAssignmentStatus: row.reviewerAssignmentStatus,
    reviewerAuthorityCode: row.reviewerAuthorityCode,
    reviewerCredentialStatus:
      row.reviewerCredentialStatus as Student500EditorialReviewRecord["reviewerCredentialStatus"],
    reviewerUserId: row.reviewerUserId,
    status: row.status as Student500EditorialReviewRecord["status"],
    updatedAt: toDate(row.updatedAt),
  };
}

export function createPostgresDeepPreparationStore(
  options: { readonly run?: DeepPreparationQueryRunner } = {}
): Student500DeepPreparationStore {
  const run = options.run ?? defaultRunner;
  return {
    async listProposals({ applicationId }) {
      const rows = (await run(sql`
        select * from "Student500GsRevisionProposal"
        where "applicationId" = ${applicationId}
        order by "createdAt" asc
      `)) as unknown as ProposalRow[];
      return rows.map(mapProposal);
    },

    async getProposal({ projectId, applicationId, proposalId }) {
      const result = (await run(sql`
        select * from "Student500GsRevisionProposal"
        where "id" = ${proposalId}
          and "projectId" = ${projectId}
          and "applicationId" = ${applicationId}
        limit 1
      `)) as unknown as ProposalRow[];
      const row = result[0];
      return row ? mapProposal(row) : null;
    },

    async claimProposal({ projectId, applicationId, proposalId }) {
      // Conditional update: exactly one concurrent accept moves proposed -> accepting.
      const claimed = (await run(sql`
        update "Student500GsRevisionProposal"
        set "status" = 'accepting'
        where "id" = ${proposalId}
          and "projectId" = ${projectId}
          and "applicationId" = ${applicationId}
          and "status" = 'proposed'
        returning *
      `)) as unknown as ProposalRow[];
      const row = claimed[0];
      if (row) {
        return { claimed: true, record: mapProposal(row) };
      }
      // Either another caller claimed it, or it is already decided.
      const current = await findProposalForUpdate(run, {
        applicationId,
        projectId,
        proposalId,
      });
      if (current.status !== "accepting") {
        throw new Student500PreparationError("state_conflict");
      }
      return { claimed: false, record: current };
    },

    insertProposal({ projectId, applicationId, values, actorUserId }) {
      return insertProposalOnce(run, {
        applicationId,
        actorUserId,
        projectId,
        values,
      });
    },

    async decideProposal(input) {
      const existing = await findProposalForUpdate(run, input);
      // The TypeScript state machine is the first gate...
      assertProposalTransition(existing.status, input.status);
      // ...and the conditional UPDATE repeats the *exact* valid source state for
      // this target, so a concurrent writer cannot slip between the read above and
      // the write. `accepted` is only reachable from the claim state.
      const sourceGuard =
        input.status === "accepted"
          ? sql`and "status" = 'accepting'`
          : input.status === "rejected"
            ? sql`and "status" = 'proposed'`
            : sql`and "status" in ('proposed','accepting')`;
      const result = (await run(sql`
        update "Student500GsRevisionProposal"
        set "status" = ${input.status},
            "decidedByUserId" = ${input.actorUserId},
            "decidedAt" = now(),
            "acceptedDraftId" = ${input.status === "accepted" ? input.acceptedDraftId : null}
        where "id" = ${input.proposalId}
          and "projectId" = ${input.projectId}
          and "applicationId" = ${input.applicationId}
          ${sourceGuard}
        returning *
      `)) as unknown as ProposalRow[];
      const row = result[0];
      if (!row) {
        throw new Student500PreparationError("state_conflict");
      }
      return mapProposal(row);
    },

    async supersedeProposalsForApplication({ applicationId }) {
      const result = (await run(sql`
        update "Student500GsRevisionProposal"
        set "status" = 'superseded'
        where "applicationId" = ${applicationId}
          and "status" in ('proposed','accepting')
        returning "id"
      `)) as unknown as { id: string }[];
      return result.length;
    },

    async listEditorialReviews({ applicationId }) {
      const rows = (await run(sql`
        select * from "Student500EditorialReview"
        where "applicationId" = ${applicationId}
        order by "reviewRound" asc
      `)) as unknown as ReviewRow[];
      return rows.map(mapReview);
    },

    async getEditorialReview({ projectId, applicationId, reviewId }) {
      const result = (await run(sql`
        select * from "Student500EditorialReview"
        where "id" = ${reviewId}
          and "projectId" = ${projectId}
          and "applicationId" = ${applicationId}
        limit 1
      `)) as unknown as ReviewRow[];
      const row = result[0];
      return row ? mapReview(row) : null;
    },

    insertEditorialReview({ projectId, applicationId, values }) {
      return insertEditorialReviewOnce(run, {
        applicationId,
        projectId,
        values,
      });
    },

    async updateEditorialReview(input) {
      const current = (await run(sql`
        select * from "Student500EditorialReview"
        where "id" = ${input.reviewId}
          and "projectId" = ${input.projectId}
          and "applicationId" = ${input.applicationId}
        limit 1
      `)) as unknown as ReviewRow[];
      const existing = current[0];
      if (!existing) {
        throw new Student500PreparationError("editorial_review_not_found");
      }
      if (existing.status !== input.status) {
        assertEditorialTransition(
          existing.status as Student500EditorialReviewRecord["status"],
          input.status
        );
      }
      const result = (await run(sql`
        update "Student500EditorialReview"
        set "status" = ${input.status},
            "comments" = ${JSON.stringify(input.comments)}::jsonb,
            "proposedEdits" = ${JSON.stringify(input.proposedEdits)}::jsonb,
            "reviewerUserId" = ${input.reviewerUserId},
            "reviewerAuthorityCode" = ${input.reviewerAuthorityCode},
            "reviewerAssignmentStatus" = ${input.reviewerAssignmentStatus},
            "reviewerCredentialStatus" = ${input.reviewerCredentialStatus},
            "customerDecisionCode" = ${input.customerDecisionCode},
            "updatedAt" = now()
        where "id" = ${input.reviewId}
          and "projectId" = ${input.projectId}
          and "applicationId" = ${input.applicationId}
        returning *
      `)) as unknown as ReviewRow[];
      const row = result[0];
      if (!row) {
        throw new Student500PreparationError("integrity_conflict");
      }
      return mapReview(row);
    },
  };
}

async function findProposalForUpdate(
  run: DeepPreparationQueryRunner,
  input: {
    readonly projectId: string;
    readonly applicationId: string;
    readonly proposalId: string;
  }
) {
  const result = (await run(sql`
    select * from "Student500GsRevisionProposal"
    where "id" = ${input.proposalId}
      and "projectId" = ${input.projectId}
      and "applicationId" = ${input.applicationId}
    for update
  `)) as unknown as ProposalRow[];
  const row = result[0];
  if (!row) {
    throw new Student500PreparationError("proposal_not_found");
  }
  return mapProposal(row);
}

/**
 * Insert-once proposal write. A unique-violation is not an error here: it means the
 * caller replayed the same logical request, so the persisted row is returned.
 */
async function insertProposalOnce(
  run: DeepPreparationQueryRunner,
  input: {
    readonly projectId: string;
    readonly applicationId: string;
    readonly values: NewProposalValues;
    readonly actorUserId: string;
  }
) {
  const values = input.values;
  const result = (await run(sql`
    insert into "Student500GsRevisionProposal" (
      "id","projectId","applicationId","baseDraftId","baseDraftVersion",
      "baseDraftContentSha256","sections","sectionCount","contentSha256",
      "inputDigest","status","composerKind","composerCode","attribution",
      "createdByUserId"
    ) values (
      ${values.id},${input.projectId},${input.applicationId},${values.baseDraftId},
      ${values.baseDraftVersion},${values.baseDraftContentSha256},
      ${JSON.stringify(values.sections)}::jsonb,${values.sections.length},
      ${values.contentSha256},${values.inputDigest},'proposed',
      ${values.composerKind},${values.composerCode},
      ${JSON.stringify(values.attribution)}::jsonb,${input.actorUserId}
    )
    on conflict do nothing
    returning *
  `)) as unknown as ProposalRow[];
  const inserted = result[0];
  if (inserted) {
    return mapProposal(inserted);
  }
  const replay = (await run(sql`
    select * from "Student500GsRevisionProposal"
    where "applicationId" = ${input.applicationId}
      and "contentSha256" = ${values.contentSha256}
    limit 1
  `)) as unknown as ProposalRow[];
  const row = replay[0];
  if (!row) {
    throw new Student500PreparationError("integrity_conflict");
  }
  if (
    row.projectId !== input.projectId ||
    row.baseDraftId !== values.baseDraftId ||
    row.contentSha256 !== values.contentSha256
  ) {
    throw new Student500PreparationError("idempotency_conflict");
  }
  return mapProposal(row);
}

/** Inserts one editorial round, or resolves an idempotent replay of the same one. */
export async function insertEditorialReviewOnce(
  run: DeepPreparationQueryRunner,
  input: {
    readonly projectId: string;
    readonly applicationId: string;
    readonly values: NewEditorialReviewValues;
  }
) {
  const values = input.values;
  const result = (await run(sql`
    insert into "Student500EditorialReview" (
      "id","projectId","applicationId","reviewRound","draftId","draftVersion",
      "draftContentSha256","consentCode","consentSha256","disclosureScopes",
      "disclosedFactReferenceIds","status","reviewerUserId",
      "reviewerAuthorityCode","reviewerAssignmentStatus",
      "reviewerCredentialStatus","comments","proposedEdits","inputDigest",
      "requestedByUserId"
    ) values (
      ${values.id},${input.projectId},${input.applicationId},${values.reviewRound},
      ${values.draftId},${values.draftVersion},${values.draftContentSha256},
      ${values.consentCode},${values.consentSha256},
      ${JSON.stringify(values.disclosureScopes)}::jsonb,
      ${JSON.stringify(values.disclosedFactReferenceIds)}::jsonb,
      ${values.status},${values.reviewerUserId},${values.reviewerAuthorityCode},
      ${values.reviewerAssignmentStatus},${values.reviewerCredentialStatus},
      ${JSON.stringify(values.comments)}::jsonb,
      ${JSON.stringify(values.proposedEdits)}::jsonb,
      ${values.inputDigest},${values.requestedByUserId}
    )
    on conflict do nothing
    returning *
  `)) as unknown as ReviewRow[];
  const inserted = result[0];
  if (inserted) {
    return mapReview(inserted);
  }
  const replay = (await run(sql`
    select * from "Student500EditorialReview"
    where "id" = ${values.id}
      and "projectId" = ${input.projectId}
      and "applicationId" = ${input.applicationId}
    limit 1
  `)) as unknown as ReviewRow[];
  const row = replay[0];
  if (!row) {
    throw new Student500PreparationError("integrity_conflict");
  }
  if (row.consentSha256 !== values.consentSha256) {
    throw new Student500PreparationError("idempotency_conflict");
  }
  return mapReview(row);
}
