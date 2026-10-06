# PI-RR-02 — Guidance status and subject/scope contract

**Status:** SOURCE REVIEW ACCEPTED; OWNER FULL LOCAL VALIDATION PASS; STAGING REVALIDATION PASS
**Activated:** 2026-10-06 by explicit owner instruction  
**Canonical branch:** `phase11-chinese-service-platform-ui-rebase`
**Accepted canonical commit:** `9461efbe14b22936e6a7311eaadbff413d02070f` (`fix: align policy guidance publication contract`)
**Implementation starting commit:** `199ad837bc417682b2257c3a95462fe8a1514bdf`

RR-01 was accepted at the starting commit, fast-forwarded into the canonical
`phase11-chinese-service-platform-ui-rebase` branch, pushed and remotely
verified, and deployed to staging. The established staging record includes a
successful web rollout with `/ping` HTTP 200, policy-sync task definition `:7`
deployed with the scheduler switched to `:7`, and a completed manual policy
sync whose real staging evidence informed RR-02 diagnosis. RR-02 source review
is accepted, owner full local validation passed, and staging revalidation
passed. RR-02 is committed and pushed at the accepted canonical commit above
and has been deployed to staging.

## Frozen failure evidence

- The analyzer represented an official Home Affairs guidance publication as
  `in_force`, while the verifier correctly held the unsupported status.
- The verifier correctly held a scope shift from “visa applications
  prioritized” to “applicants are priority recipients.”
- Structured Home Affairs alert HTML could be sliced before normalization,
  retaining partial markup while the snapshot did not record structured-alert
  truncation.

## Bounded correction

- Normalize structured alert title and content to plain text before applying
  character bounds. Keep output and acquisition limits, record
  `alertPreviewTruncated`, propagate it through `sourceMetadata.discoveryMetadata`,
  and include structured-alert truncation in acquisition `evidenceTruncated`.
  Fingerprint the full normalized title/content rather than the bounded display
  preview. If both are empty, fingerprint a deterministic tuple of bounded
  allowlisted alert metadata (`id`, `alertId`, `identifier`, `category`, `type`,
  `updateDate`); do not serialize arbitrary source objects.
- Add `published_guidance` for official publication/provenance without
  legislative force. Keep `POLICY_ANALYSIS_SCHEMA` at
  `policy-intelligence.analysis.v2`; update status types, schema projections,
  storage typing, UI grouping, badges and bilingual labels. The database field
  is varchar with a TypeScript value list, so no DDL migration is indicated.
- Clarify analyzer and verifier semantics for legal status, exact
  `sourceStatus.claimRef` support, and grammatical/legal subject and scope.
  Conditional practical interpretations require bilingual uncertainty.
- Bump analyzer/verifier implementation versions from v2.1 to v2.2 so existing
  analysis fingerprints invalidate under the current fingerprint contract.
- Preserve `evaluatePublicationGate()` strictness and retain the Federal
  Register `in_force` path when evidence and verification support it.

## Required regression coverage

- Official published guidance can pass as `published_guidance` without an
  `in_force` assertion.
- Application/applicant scope shifts remain held; conditional practical
  interpretations remain qualified.
- Supported Federal Register `in_force` remains valid; non-policy material
  remains held.
- Structured alert HTML is normalized before slicing and truncation provenance
  reaches acquisition metadata.
- Analyzer/verifier version changes invalidate fingerprints while schema v2 is
  preserved.
- Running the same candidate/hash under v2.1 then v2.2 reuses the snapshot but
  reruns analyzer and verifier and persists a second revision.

## Frozen implementation and final validation

RR-02 implementation source review is **ACCEPTED**. Owner full local
validation is **PASS**. The implementation is frozen and no further source
correction is planned. The final validation record is:

- Focused Policy Intelligence tests: **106 passed, 0 failed, 0 skipped**.
- Full unit suite: **522 passed, 0 failed, 0 skipped**; exit code 0.
- Next.js production build: **PASS**; production route manifest generated.
- `git diff --check`: **PASS**.

## AWS staging revalidation — PASS

Environment: AWS account `747452892291`, region `ap-southeast-2`, cluster
`immigration-ai-staging`.

### Web rollout

- Task definition: `immigration-ai-staging-web:42`.
- Chatbot image:
  `747452892291.dkr.ecr.ap-southeast-2.amazonaws.com/immigration-ai/chatbot@sha256:7381056fc38d4f116bbb4c55ab62818c586c0aefa9503f9ad8700b8066f2c3f3`.
- Legal-service image was not changed.
- Running tasks: 1; pending tasks: 0; rollout: `COMPLETED`.
- `https://staging.aulawyers.au/ping` returned HTTP 200.

### Policy-sync runner and scheduler

- Task definition: `immigration-ai-staging-policy-sync:10`.
- Image:
  `747452892291.dkr.ecr.ap-southeast-2.amazonaws.com/immigration-ai/chatbot@sha256:58c5382a83f92a339f38af43e6a3f6fed47a9000988ea06aac5ac2f7c37354fa`.
- Scheduler `immigration-ai-staging-policy-sync-daily` remains `ENABLED` with
  `cron(0 6 * * ? *)` in `Australia/Sydney`; its target now uses task
  definition `:10`. Schedule and timezone are unchanged.
- Manual RR-02 sync task:
  `arn:aws:ecs:ap-southeast-2:747452892291:task/immigration-ai-staging/04abea5e5a444f87a09fb57595e2e7ff`.
  It reached `STOPPED` with stop code `EssentialContainerExited`; the
  `policy-sync` container exit code was `0`, indicating successful one-shot
  runner completion.

## Preserved architecture and rollout state

- `POLICY_ANALYSIS_SCHEMA` remains `policy-intelligence.analysis.v2`;
  analyzer and verifier remain v2.2.
- `evaluatePublicationGate()` remains unchanged and strict.
- No database migration was added.
- Federal Register RR-01 discovery/ranking remains unchanged.
- RR-01 remains accepted and staging-deployed. The protected
  `policy-intelligence-admin-detail-wip-20261004` branch remains untouched.
- RR-02 staging revalidation passed as recorded above. No database migration
  was added; the described AWS deployment was the accepted staging rollout.
