/**
 * Phase 14-B: independent, request-scoped validation of a Project Document evidence
 * reference used as a Project Fact's source.
 *
 * This deliberately reuses the Phase 13 M2 evidence reference resolution, which already
 * enforces: opaque request-scoped ref, exact immutable version, completed extraction run,
 * live per-purpose permission for this actor, and an authenticated clean-scan attestation.
 * Nothing here trusts a stored `sourceEvidenceRef` merely because a row contains it.
 */
export type ProjectEvidenceRefValidator = (input: {
  actorUserId: string;
  projectId: string;
  evidenceRef: string;
}) => Promise<boolean>;

/** Upper bound on distinct fact-source references validated in one request. */
export const MAX_VERIFIED_FACT_EVIDENCE_REFS = 20;

/**
 * Validate the distinct source references cited by the facts that are about to be sent.
 * Bounded and fail-closed: an unknown, revoked, mismatched or throwing ref simply does
 * not appear in the returned set, so the packet builder drops that fact.
 */
export async function collectVerifiedFactEvidenceRefs(input: {
  actorUserId: string;
  projectId: string;
  refs: Iterable<string | null>;
  validate: ProjectEvidenceRefValidator;
  maxRefs?: number;
}): Promise<Set<string>> {
  const limit = input.maxRefs ?? MAX_VERIFIED_FACT_EVIDENCE_REFS;
  const unique = [
    ...new Set(
      [...input.refs].filter(
        (ref): ref is string => typeof ref === "string" && ref.length > 0
      )
    ),
  ].slice(0, limit);
  const results = await Promise.all(
    unique.map(async (evidenceRef) => ({
      evidenceRef,
      verified: await input.validate({
        actorUserId: input.actorUserId,
        projectId: input.projectId,
        evidenceRef,
      }),
    }))
  );
  return new Set(
    results
      .filter((result) => result.verified)
      .map((result) => result.evidenceRef)
  );
}
