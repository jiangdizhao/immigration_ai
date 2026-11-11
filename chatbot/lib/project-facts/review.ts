import { createHash } from "node:crypto";
import type {
  ProjectFactCandidateDraft,
  ProjectFactExtractionResult,
} from "./extraction";
import type {
  FactAudience,
  ProjectFactAssertion,
  ProjectFactPublication,
  ProjectFactUseGrant,
} from "./facts";

/**
 * Phase 14-B Project Fact review orchestration.
 *
 * One customer action may touch several existing primitives, but their semantics stay
 * distinct: confirmation is a state transition, AI publication is a publication row and
 * AI use is a separate `ai_context` grant. This module never fuses them into one
 * "verified profile" write.
 *
 * ## Project revision propagation (R1-01)
 *
 * The PostgreSQL repository advances `StudyJourneyProject.revision` by exactly one on each
 * successful mutation and rejects a stale `expectedProjectRevision` (compare-and-swap). A
 * batch that reused one revision would fail after its first item. This module therefore
 * keeps an explicit revision cursor, refreshes it from the server after every successful
 * write, retries a single item once after a genuine CAS conflict (the failed transaction
 * had no effect and the deterministic operation id makes a duplicate impossible), and
 * reports truthful partial completion instead of claiming the whole batch succeeded.
 *
 * The CAS rule itself is never weakened: the repository keeps owning optimistic
 * concurrency and assertion-version checks still gate every transition.
 */

export type FactActorContext = {
  actorUserId: string;
  projectId: string;
  expectedProjectRevision: number;
};

export type FactReviewItem = {
  assertionId: string;
  assertionVersion: number;
};

/** Authoritative read of the current Project revision for this actor. */
export type ProjectRevisionReader = (input: {
  actorUserId: string;
  projectId: string;
}) => Promise<number>;

export type FactOperationFailure = {
  index: number;
  assertionId: string;
  code: string;
  /** True when the failure is a Project CAS conflict rather than a fact-level rule. */
  revisionConflict: boolean;
};

export type FactBatchResult<T> = {
  completed: T[];
  failures: FactOperationFailure[];
  /** True only when every requested item succeeded. */
  complete: boolean;
  sawRevisionConflict: boolean;
};

const MAX_REVISION_RETRIES = 1;

function subOperationId(base: string, suffix: string): string {
  return `${base}:${suffix}`;
}

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string" && code.length > 0) {
      return code;
    }
  }
  return "operation_failed";
}

/** Deterministic, bounded request key for one proposal batch. */
export function proposalRequestKey(input: {
  action: string;
  projectId: string;
  actorUserId: string;
  payload: readonly unknown[];
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        action: input.action,
        actorUserId: input.actorUserId,
        projectId: input.projectId,
        payload: input.payload,
      })
    )
    .digest("hex")
    .slice(0, 32);
}

type FactService = {
  propose: (input: {
    actorUserId: string;
    projectId: string;
    operationId: string;
    expectedProjectRevision: number;
    key: string;
    valueType: ProjectFactAssertion["valueType"];
    value: unknown;
    originKind: "customer_stated" | "document_extracted" | "ai_inferred";
    sourceEvidenceRef?: string | null;
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
    observedAt?: string | null;
    supersedesAssertionId?: string | null;
  }) => Promise<ProjectFactAssertion>;
  confirm: (input: {
    actorUserId: string;
    projectId: string;
    operationId: string;
    expectedProjectRevision: number;
    assertionId: string;
    assertionVersion: number;
  }) => Promise<ProjectFactAssertion>;
  reject: (input: {
    actorUserId: string;
    projectId: string;
    operationId: string;
    expectedProjectRevision: number;
    assertionId: string;
    assertionVersion: number;
  }) => Promise<ProjectFactAssertion>;
  supersede: (input: {
    actorUserId: string;
    projectId: string;
    operationId: string;
    expectedProjectRevision: number;
    assertionId: string;
    assertionVersion: number;
  }) => Promise<ProjectFactAssertion>;
  publish: (input: {
    actorUserId: string;
    projectId: string;
    operationId: string;
    expectedProjectRevision: number;
    assertionId: string;
    assertionVersion: number;
    audience: FactAudience;
  }) => Promise<ProjectFactPublication>;
  grantAIUse: (input: {
    actorUserId: string;
    projectId: string;
    operationId: string;
    expectedProjectRevision: number;
    assertionId: string;
    assertionVersion: number;
    audience: FactAudience;
  }) => Promise<ProjectFactUseGrant>;
  revokeAIUse: (input: {
    actorUserId: string;
    projectId: string;
    operationId: string;
    expectedProjectRevision: number;
    assertionId: string;
    assertionVersion: number;
  }) => Promise<ProjectFactUseGrant>;
};

export function createProjectFactReviewService(input: {
  facts: FactService;
  /** Authoritative Project revision read, supplied by the server composition. */
  readProjectRevision: ProjectRevisionReader;
  /**
   * Reads the current state of one assertion. Used to distinguish "the supersede never
   * happened" from "the supersede happened but the replacement is missing".
   */
  readFactState: (input: {
    actorUserId: string;
    projectId: string;
    assertionId: string;
  }) => Promise<{ state: string; version: number } | null>;
}) {
  const { facts } = input;

  /**
   * Sequential writes with an explicit revision cursor. Every item is attempted at most
   * twice and only a CAS conflict triggers the retry; the returned result is always a
   * truthful picture of what was actually written.
   */
  async function runBatch<T>(inputValue: {
    actor: FactActorContext;
    items: readonly FactReviewItem[];
    run: (item: FactReviewItem, revision: number) => Promise<T>;
  }): Promise<FactBatchResult<T>> {
    const completed: T[] = [];
    const failures: FactOperationFailure[] = [];
    let revision = inputValue.actor.expectedProjectRevision;
    let sawRevisionConflict = false;

    for (const [index, item] of inputValue.items.entries()) {
      let attempt = 0;
      let settled = false;
      while (!settled) {
        try {
          completed.push(await inputValue.run(item, revision));
          settled = true;
        } catch (error) {
          const code = errorCode(error);
          if (code === "revision_conflict" && attempt < MAX_REVISION_RETRIES) {
            sawRevisionConflict = true;
            attempt += 1;
            // The conflicting transaction had no effect; adopt the server's revision and
            // retry this one item. The deterministic operation id prevents duplicates.
            revision = await input.readProjectRevision({
              actorUserId: inputValue.actor.actorUserId,
              projectId: inputValue.actor.projectId,
            });
            continue;
          }
          failures.push({
            index,
            assertionId: item.assertionId,
            code,
            revisionConflict: code === "revision_conflict",
          });
          settled = true;
        }
      }
      if (
        settled &&
        completed.length + failures.length < inputValue.items.length
      ) {
        // Refresh before the next write: a successful mutation advanced the revision and
        // an idempotent replay did not, so only the server can say which happened.
        revision = await input.readProjectRevision({
          actorUserId: inputValue.actor.actorUserId,
          projectId: inputValue.actor.projectId,
        });
      }
    }

    return {
      completed,
      failures,
      complete: failures.length === 0,
      sawRevisionConflict,
    };
  }

  return {
    /**
     * Persist a deterministic extraction result as **proposed** candidates. Nothing is
     * confirmed, published or granted here, and a Project CAS conflict is retried once
     * rather than silently skipping a candidate.
     */
    async proposeExtracted(inputValue: {
      actor: FactActorContext;
      operationId: string;
      extraction: ProjectFactExtractionResult;
      /** Drafts the customer explicitly excluded in the review UI. */
      excludedKeys?: readonly string[];
    }): Promise<{
      proposed: ProjectFactAssertion[];
      failures: FactOperationFailure[];
      conflictKeys: string[];
      complete: boolean;
    }> {
      const excluded = new Set(inputValue.excludedKeys ?? []);
      const conflictKeys: string[] = [];
      const drafts: ProjectFactCandidateDraft[] = inputValue.extraction.drafts;
      let revision = inputValue.actor.expectedProjectRevision;
      const proposed: ProjectFactAssertion[] = [];
      const failures: FactOperationFailure[] = [];

      for (const [index, draft] of drafts.entries()) {
        if (excluded.has(`${draft.key}|${draft.value}`)) {
          continue;
        }
        if (draft.conflictsWithExisting) {
          conflictKeys.push(draft.key);
        }
        const operationId = subOperationId(
          inputValue.operationId,
          `propose-${index}-${proposalRequestKey({
            action: "propose",
            actorUserId: inputValue.actor.actorUserId,
            projectId: inputValue.actor.projectId,
            payload: [draft.key, draft.value, draft.sourceEvidenceRef],
          })}`
        );
        let attempt = 0;
        let settled = false;
        while (!settled) {
          try {
            proposed.push(
              await facts.propose({
                actorUserId: inputValue.actor.actorUserId,
                projectId: inputValue.actor.projectId,
                operationId,
                expectedProjectRevision: revision,
                key: draft.key,
                valueType: draft.valueType,
                value: draft.value,
                originKind: "document_extracted",
                sourceEvidenceRef: draft.sourceEvidenceRef,
                effectiveFrom: draft.effectiveFrom,
                effectiveTo: draft.effectiveTo,
                observedAt: draft.observedAt,
                supersedesAssertionId: null,
              })
            );
            settled = true;
          } catch (error) {
            const code = errorCode(error);
            if (
              code === "revision_conflict" &&
              attempt < MAX_REVISION_RETRIES
            ) {
              attempt += 1;
              revision = await input.readProjectRevision({
                actorUserId: inputValue.actor.actorUserId,
                projectId: inputValue.actor.projectId,
              });
              continue;
            }
            failures.push({
              index,
              assertionId: draft.key,
              code,
              revisionConflict: code === "revision_conflict",
            });
            settled = true;
          }
        }
        if (settled && proposed.length + failures.length < drafts.length) {
          revision = await input.readProjectRevision({
            actorUserId: inputValue.actor.actorUserId,
            projectId: inputValue.actor.projectId,
          });
        }
      }

      return {
        proposed,
        failures,
        conflictKeys,
        complete: failures.length === 0,
      };
    },

    /** Batch confirmation of candidate facts the customer accepts. */
    confirmMany(inputValue: {
      actor: FactActorContext;
      operationId: string;
      items: readonly FactReviewItem[];
    }): Promise<FactBatchResult<ProjectFactAssertion>> {
      return runBatch({
        actor: inputValue.actor,
        items: inputValue.items,
        run: (item, revision) =>
          facts.confirm({
            actorUserId: inputValue.actor.actorUserId,
            projectId: inputValue.actor.projectId,
            operationId: subOperationId(
              inputValue.operationId,
              `confirm-${item.assertionId}`
            ),
            expectedProjectRevision: revision,
            assertionId: item.assertionId,
            assertionVersion: item.assertionVersion,
          }),
      });
    },

    rejectMany(inputValue: {
      actor: FactActorContext;
      operationId: string;
      items: readonly FactReviewItem[];
    }): Promise<FactBatchResult<ProjectFactAssertion>> {
      return runBatch({
        actor: inputValue.actor,
        items: inputValue.items,
        run: (item, revision) =>
          facts.reject({
            actorUserId: inputValue.actor.actorUserId,
            projectId: inputValue.actor.projectId,
            operationId: subOperationId(
              inputValue.operationId,
              `reject-${item.assertionId}`
            ),
            expectedProjectRevision: revision,
            assertionId: item.assertionId,
            assertionVersion: item.assertionVersion,
          }),
      });
    },
    /**
     * Customer correction (R1-02).
     *
     * The PostgreSQL repository only accepts `supersedesAssertionId` when the referenced
     * assertion is **already** `superseded`, so the transition must happen first. The order
     * is deliberate and recoverable: if the replacement proposal fails afterwards, the
     * original stays superseded (never silently served again) and retrying the same
     * operation id replays the transition and completes the replacement.
     */
    async correct(inputValue: {
      actor: FactActorContext;
      operationId: string;
      item: FactReviewItem;
      key: string;
      valueType: ProjectFactAssertion["valueType"];
      value: unknown;
    }): Promise<{
      status:
        | "corrected"
        | "failed_before_supersession"
        | "replacement_missing";
      created: ProjectFactAssertion | null;
      superseded: ProjectFactAssertion | null;
      code: string | null;
    }> {
      const actor = inputValue.actor;
      let revision = actor.expectedProjectRevision;
      const advance = async () => {
        revision = await input.readProjectRevision({
          actorUserId: actor.actorUserId,
          projectId: actor.projectId,
        });
      };

      const supersede = async (expectedRevision: number) =>
        facts.supersede({
          actorUserId: actor.actorUserId,
          projectId: actor.projectId,
          operationId: subOperationId(
            inputValue.operationId,
            `correct-supersede-${inputValue.item.assertionId}`
          ),
          expectedProjectRevision: expectedRevision,
          assertionId: inputValue.item.assertionId,
          assertionVersion: inputValue.item.assertionVersion,
        });

      let superseded: ProjectFactAssertion | null = null;
      let supersedeCode: string | null = null;
      for (let attempt = 0; attempt <= MAX_REVISION_RETRIES; attempt += 1) {
        try {
          superseded = await supersede(revision);
          break;
        } catch (error) {
          supersedeCode = errorCode(error);
          if (
            supersedeCode === "revision_conflict" &&
            attempt < MAX_REVISION_RETRIES
          ) {
            await advance();
            continue;
          }
          break;
        }
      }

      if (!superseded) {
        /**
         * A replay of an earlier attempt can surface as a conflict while the transition is
         * in fact already applied. Only report supersession when the stored state says so.
         */
        const current = await input.readFactState({
          actorUserId: actor.actorUserId,
          projectId: actor.projectId,
          assertionId: inputValue.item.assertionId,
        });
        if (current?.state !== "superseded") {
          return {
            status: "failed_before_supersession",
            created: null,
            superseded: null,
            code: supersedeCode ?? "state_conflict",
          };
        }
      }
      await advance();

      const create = async (expectedRevision: number) =>
        facts.propose({
          actorUserId: actor.actorUserId,
          projectId: actor.projectId,
          operationId: subOperationId(inputValue.operationId, "correct-create"),
          expectedProjectRevision: expectedRevision,
          key: inputValue.key,
          valueType: inputValue.valueType,
          value: inputValue.value,
          // A correction is the customer's own statement, not the document's.
          originKind: "customer_stated",
          sourceEvidenceRef: null,
          supersedesAssertionId: inputValue.item.assertionId,
        });

      let createdCode: string | null = null;
      for (let attempt = 0; attempt <= MAX_REVISION_RETRIES; attempt += 1) {
        try {
          return {
            status: "corrected",
            created: await create(revision),
            superseded,
            code: null,
          };
        } catch (error) {
          createdCode = errorCode(error);
          if (
            createdCode === "revision_conflict" &&
            attempt < MAX_REVISION_RETRIES
          ) {
            await advance();
            continue;
          }
          break;
        }
      }

      // The predecessor is (or already was) superseded, but the replacement is missing: a
      // recoverable state, reported explicitly and never disguised as success.
      return {
        status: "replacement_missing",
        created: null,
        superseded,
        code: createdCode ?? "state_conflict",
      };
    },

    /**
     * One customer action, two distinct authorizations: publish the confirmed fact to the
     * Project audience, then separately grant `ai_context` use. Neither implies the other,
     * and publication is reported independently of the grant so a partial result is
     * visible rather than silently reported as success.
     */
    async authorizeForAI(inputValue: {
      actor: FactActorContext;
      operationId: string;
      items: readonly FactReviewItem[];
      audience: FactAudience;
    }): Promise<{
      publications: ProjectFactPublication[];
      grants: ProjectFactUseGrant[];
      failures: FactOperationFailure[];
      complete: boolean;
      sawRevisionConflict: boolean;
    }> {
      const actor = inputValue.actor;
      const publications: ProjectFactPublication[] = [];
      const grants: ProjectFactUseGrant[] = [];
      const failures: FactOperationFailure[] = [];
      let revision = actor.expectedProjectRevision;
      let sawRevisionConflict = false;
      const advance = async () => {
        revision = await input.readProjectRevision({
          actorUserId: actor.actorUserId,
          projectId: actor.projectId,
        });
      };

      for (const [index, item] of inputValue.items.entries()) {
        // Publication first, then the separate AI-use grant.
        let published = false;
        for (
          let attempt = 0;
          attempt <= MAX_REVISION_RETRIES && !published;
          attempt++
        ) {
          try {
            publications.push(
              await facts.publish({
                actorUserId: actor.actorUserId,
                projectId: actor.projectId,
                operationId: subOperationId(
                  inputValue.operationId,
                  `publish-${item.assertionId}`
                ),
                expectedProjectRevision: revision,
                assertionId: item.assertionId,
                assertionVersion: item.assertionVersion,
                audience: inputValue.audience,
              })
            );
            published = true;
          } catch (error) {
            const code = errorCode(error);
            if (
              code === "revision_conflict" &&
              attempt < MAX_REVISION_RETRIES
            ) {
              sawRevisionConflict = true;
              await advance();
              continue;
            }
            failures.push({
              index,
              assertionId: item.assertionId,
              code,
              revisionConflict: code === "revision_conflict",
            });
            break;
          }
        }
        if (!published) {
          if (index + 1 < inputValue.items.length) {
            await advance();
          }
          continue;
        }
        await advance();

        let granted = false;
        for (
          let attempt = 0;
          attempt <= MAX_REVISION_RETRIES && !granted;
          attempt++
        ) {
          try {
            grants.push(
              await facts.grantAIUse({
                actorUserId: actor.actorUserId,
                projectId: actor.projectId,
                operationId: subOperationId(
                  inputValue.operationId,
                  `grant-${item.assertionId}`
                ),
                expectedProjectRevision: revision,
                assertionId: item.assertionId,
                assertionVersion: item.assertionVersion,
                audience: inputValue.audience,
              })
            );
            granted = true;
          } catch (error) {
            const code = errorCode(error);
            if (
              code === "revision_conflict" &&
              attempt < MAX_REVISION_RETRIES
            ) {
              sawRevisionConflict = true;
              await advance();
              continue;
            }
            // Published but not granted: report it truthfully rather than claiming the
            // fact is available to Project AI.
            failures.push({
              index,
              assertionId: item.assertionId,
              code: code === "revision_conflict" ? code : `grant_${code}`,
              revisionConflict: code === "revision_conflict",
            });
            break;
          }
        }
        if (index + 1 < inputValue.items.length) {
          await advance();
        }
      }

      return {
        publications,
        grants,
        failures,
        complete: failures.length === 0,
        sawRevisionConflict,
      };
    },

    /** Immediate effect: the next AI call re-reads the grant projection. */
    revokeAIUse(inputValue: {
      actor: FactActorContext;
      operationId: string;
      items: readonly FactReviewItem[];
    }): Promise<FactBatchResult<ProjectFactUseGrant>> {
      return runBatch({
        actor: inputValue.actor,
        items: inputValue.items,
        run: (item, revision) =>
          facts.revokeAIUse({
            actorUserId: inputValue.actor.actorUserId,
            projectId: inputValue.actor.projectId,
            operationId: subOperationId(
              inputValue.operationId,
              `revoke-ai-${item.assertionId}`
            ),
            expectedProjectRevision: revision,
            assertionId: item.assertionId,
            assertionVersion: item.assertionVersion,
          }),
      });
    },
  };
}
