import {
  assertOfficialUrlAllowed,
  getPolicyDiscoverySource,
  OPERATOR_SUBMISSION_SOURCE_ID,
} from "../../scripts/policy-intelligence-discovery";
import {
  type EditorialActor,
  type EditorialError,
  type EditorialResult,
  editorialError,
  type OperatorSubmissionRow,
} from "./editorial-core";
import { isEditorialError } from "./editorial-service";

/**
 * Phase 12 Stage 3 — authorized official-URL submission.
 *
 * A Policy Editor (or administrator) may submit a genuine official Australian
 * Government URL when standing discovery did not find it. The URL is validated
 * against the controlled allowlist here; the fetch itself happens later inside
 * the existing discovery pipeline with all of its protections intact.
 */

export const OPERATOR_SUBMISSION_NOTE_MAX_LENGTH = 500;
export const OPERATOR_SUBMISSION_URL_MAX_LENGTH = 2000;

export type OperatorSubmissionTx = {
  getActor(userId: string): Promise<EditorialActor | null>;
  isActivePolicyEditor(userId: string): Promise<boolean>;
  findPendingSubmissionByUrl(
    submittedUrl: string
  ): Promise<OperatorSubmissionRow | null>;
  insertSubmission(values: {
    submittedUrl: string;
    submittedByUserId: string;
    note: string | null;
    now: Date;
  }): Promise<OperatorSubmissionRow>;
  appendAuditEvent(values: {
    actorUserId: string;
    action: string;
    itemId: string | null;
    revisionId: string | null;
    overrideReason: string | null;
    detail: Record<string, unknown>;
  }): Promise<void>;
};

export interface OperatorSubmissionRepository {
  run<T>(work: (tx: OperatorSubmissionTx) => Promise<T>): Promise<T>;
  listSubmissions(limit: number): Promise<OperatorSubmissionRow[]>;
  listPendingSubmissions(limit: number): Promise<OperatorSubmissionRow[]>;
  markSubmission(input: {
    id: string;
    status: "consumed" | "failed";
    errorCode: string | null;
    now: Date;
  }): Promise<void>;
}

export type OperatorSubmissionService = {
  submit(input: {
    actorUserId: string;
    url: string;
    note?: string | null;
  }): Promise<EditorialResult<{ submissionId: string; submittedUrl: string }>>;
  /**
   * R3 P1: listing operator submissions is part of the same privileged
   * capability as submitting them, so it enforces the identical authority
   * contract server-side (verified lawyer + currently active Policy Editor
   * grant) instead of merely requiring authentication.
   */
  list(input: {
    actorUserId: string;
  }): Promise<EditorialResult<OperatorSubmissionRow[]>>;
};

/**
 * The single substantive authority contract for the operator workflow (submit
 * and list), per D-070: a verified Admin (the firm's principal lawyer) has
 * inherent authority, and every other account must be a *verified* lawyer with
 * a *currently active* Policy Editor grant. An unverified identity, an ordinary
 * user, a lawyer without a grant, or a forged grant can never satisfy it.
 */
async function requireOperatorWorkflowAuthority(
  tx: OperatorSubmissionTx,
  actorUserId: string
): Promise<EditorialActor | EditorialError> {
  const actor = await tx.getActor(actorUserId);
  if (!actor) {
    return editorialError("unauthenticated");
  }
  // D-070: feeding/reading the official-source pipeline is publication-
  // authority work. A verified Admin holds it inherently; other accounts need
  // the verified, explicitly granted lawyer capability.
  if (!actor.emailVerifiedAt) {
    return editorialError("identity_not_verified");
  }
  if (actor.role === "admin") {
    return actor;
  }
  if (actor.role !== "lawyer") {
    return editorialError("publication_authority_required");
  }
  if (!(await tx.isActivePolicyEditor(actor.userId))) {
    return editorialError("capability_required");
  }
  return actor;
}

/**
 * Validates a submitted URL against the operator-submission allowlist
 * (exact official hosts plus the official `.gov.au` suffix). HTTPS only, no
 * credentials, standard port. Returns the canonical URL.
 */
export function validateSubmittedOfficialUrl(
  rawUrl: string
): EditorialResult<string> {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > OPERATOR_SUBMISSION_URL_MAX_LENGTH) {
    return editorialError("invalid_official_url");
  }
  try {
    const source = getPolicyDiscoverySource(OPERATOR_SUBMISSION_SOURCE_ID);
    return { status: "ok", value: assertOfficialUrlAllowed(trimmed, source) };
  } catch {
    return editorialError("invalid_official_url");
  }
}

export function createOperatorSubmissionService(
  repository: OperatorSubmissionRepository
): OperatorSubmissionService {
  return {
    async submit(input) {
      const validated = validateSubmittedOfficialUrl(input.url);
      if (isEditorialError(validated)) {
        return validated;
      }
      const note =
        typeof input.note === "string" && input.note.trim()
          ? input.note.trim().slice(0, OPERATOR_SUBMISSION_NOTE_MAX_LENGTH)
          : null;
      return await repository.run(async (tx) => {
        const actor = await requireOperatorWorkflowAuthority(
          tx,
          input.actorUserId
        );
        if (isEditorialError(actor)) {
          return actor;
        }
        const existing = await tx.findPendingSubmissionByUrl(validated.value);
        if (existing) {
          return editorialError("duplicate_submission");
        }
        const now = new Date();
        const submission = await tx.insertSubmission({
          submittedUrl: validated.value,
          submittedByUserId: actor.userId,
          note,
          now,
        });
        await tx.appendAuditEvent({
          actorUserId: actor.userId,
          action: "submit_official_url",
          itemId: null,
          revisionId: null,
          overrideReason: null,
          detail: {
            submissionId: submission.id,
            submittedUrl: submission.submittedUrl,
          },
        });
        return {
          status: "ok" as const,
          value: {
            submissionId: submission.id,
            submittedUrl: submission.submittedUrl,
          },
        };
      });
    },

    async list(input) {
      return await repository.run(async (tx) => {
        // R3 P1: the same authority contract as submission — authorization is
        // enforced here, server-side, for every caller (page render, API route).
        const actor = await requireOperatorWorkflowAuthority(
          tx,
          input.actorUserId
        );
        if (isEditorialError(actor)) {
          return actor;
        }
        return {
          status: "ok" as const,
          value: await repository.listSubmissions(25),
        };
      });
    },
  };
}

export type OperatorSubmissionServiceError = EditorialError;

/**
 * Marks submissions against the outcomes of one discovery/sync run so the
 * operator always sees an honest lifecycle state instead of an indefinite
 * "pending".
 */
export function planOperatorSubmissionOutcomes(input: {
  submissions: readonly { id: string; candidateId: string | null }[];
  failures: readonly { submissionId: string; errorCode: string }[];
  outcomes: readonly {
    candidateId: string;
    /**
     * Phase 12 Stage 3 D-072 — `source_first_published` counts as a successful
     * release for the submission: the official source reached the public page.
     */
    outcome:
      | "published"
      | "source_first_published"
      | "held"
      | "unchanged"
      | "failed"
      | "suppressed";
    reasonCode?: string;
  }[];
}): { id: string; status: "consumed" | "failed"; errorCode: string | null }[] {
  const outcomeByCandidate = new Map(
    input.outcomes.map((outcome) => [outcome.candidateId, outcome])
  );
  const failureBySubmission = new Map(
    input.failures.map((failure) => [failure.submissionId, failure.errorCode])
  );
  const planned: {
    id: string;
    status: "consumed" | "failed";
    errorCode: string | null;
  }[] = [];
  for (const submission of input.submissions) {
    const fetchFailure = failureBySubmission.get(submission.id);
    if (fetchFailure) {
      planned.push({
        id: submission.id,
        status: "failed",
        errorCode: fetchFailure.slice(0, 100),
      });
      continue;
    }
    const outcome = submission.candidateId
      ? outcomeByCandidate.get(submission.candidateId)
      : undefined;
    if (!outcome) {
      continue;
    }
    if (outcome.outcome === "failed") {
      planned.push({
        id: submission.id,
        status: "failed",
        errorCode: (outcome.reasonCode ?? "sync_failed").slice(0, 100),
      });
    } else {
      planned.push({ id: submission.id, status: "consumed", errorCode: null });
    }
  }
  return planned;
}
